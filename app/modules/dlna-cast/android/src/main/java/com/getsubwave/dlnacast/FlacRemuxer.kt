package com.getsubwave.dlnacast

import android.util.Log
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.OutputStream

/**
 * Turns an Ogg-encapsulated FLAC stream (the Ogg FLAC mapping Icecast/Liquidsoap
 * serve as application/ogg) into a native FLAC stream that DLNA renderers such as
 * the Denon AVR-X2800H can decode.
 *
 * This is lossless and bit-perfect: every FLAC audio frame is copied untouched,
 * only the Ogg page framing around it is removed. Output is
 *   "fLaC" + STREAMINFO (flagged as the last metadata block) + audio frames…
 *
 * Other metadata blocks (VORBIS_COMMENT, PICTURE, …) are dropped; renderers do
 * not need them and large embedded artwork is known to upset HEOS firmware.
 * A chained stream (Liquidsoap starts a new logical bitstream per track) re-sends
 * the mapping header; those repeats are skipped so the renderer sees one
 * continuous FLAC stream.
 *
 * If the upstream turns out to already be native FLAC it is passed straight through.
 */
internal class FlacRemuxer(
    private val input: BufferedInputStream,
    private val out: OutputStream,
) {
    private val data = DataInputStream(input)
    private val pending = ByteArrayOutputStream()
    private var pendingValid = false
    private var headerWritten = false

    fun run() {
        input.mark(4)
        val magic = ByteArray(4)
        data.readFully(magic)
        input.reset()
        if (String(magic, Charsets.US_ASCII) == "fLaC") {
            input.copyTo(out, 16 * 1024)
            return
        }
        while (syncToCapture()) {
            readPage()
            out.flush()
        }
    }

    /** Consume bytes until the "OggS" capture pattern; false at end of stream. */
    private fun syncToCapture(): Boolean {
        var window = 0
        while (true) {
            val b = input.read()
            if (b < 0) return false
            window = (window shl 8) or b
            if (window == OGGS) return true
        }
    }

    /** Read the rest of one Ogg page (after "OggS") and emit every packet it completes. */
    private fun readPage() {
        // version(1) header_type(1) granule(8) serial(4) sequence(4) crc(4) segments(1)
        val header = ByteArray(23)
        data.readFully(header)
        val headerType = header[1].toInt() and 0xFF
        val segCount = header[22].toInt() and 0xFF
        val lacing = ByteArray(segCount)
        data.readFully(lacing)

        val continued = (headerType and 0x01) != 0
        if (!continued) {
            // A fresh packet starts here; anything left over was never completed.
            pending.reset()
            pendingValid = true
        }
        // continued && !pendingValid: we joined mid-packet; drop bytes up to the next boundary.

        for (i in 0 until segCount) {
            val len = lacing[i].toInt() and 0xFF
            val seg = ByteArray(len)
            data.readFully(seg)
            if (pendingValid) pending.write(seg)
            if (len < 255) {
                if (pendingValid) handlePacket(pending.toByteArray())
                pending.reset()
                pendingValid = true
            } else if (pending.size() > MAX_PACKET) {
                // Garbage or a desync: give up on this packet.
                pending.reset()
                pendingValid = false
            }
        }
    }

    private fun handlePacket(p: ByteArray) {
        if (p.isEmpty()) return
        if (isMappingHeader(p)) {
            // 0x7F "FLAC" major minor headerCount(2) "fLaC" STREAMINFO-block(4 + 34)
            if (!headerWritten && p.size >= 51) {
                out.write(p, 9, 4)                            // "fLaC"
                out.write((p[13].toInt() and 0x7F) or 0x80)  // STREAMINFO, marked last
                out.write(p, 14, 3)                           // block length (34)
                // Rewrite min_blocksize..max_framesize (first 10 bytes of STREAMINFO)
                // to allow variable block sizes (16..4096) across song boundaries:
                val si = p.copyOfRange(17, 17 + 34)
                si[0] = 0x00; si[1] = 0x10 // min_blocksize = 16
                si[2] = 0x10; si[3] = 0x00 // max_blocksize = 4096
                for (k in 4..9) si[k] = 0  // min/max_framesize = 0 (unknown)
                out.write(si)
                headerWritten = true
            } else if (headerWritten) {
                Log.i(TAG, "chain boundary (new song): continuing sample numbering at $nextSampleNumber")
            }
            return
        }
        if (headerWritten && isFrame(p)) out.write(renumber(p))
        // Anything else is a metadata block: dropped on purpose.
    }

    /**
     * Each new Ogg chain (one per song) restarts FLAC frame numbers at 0, and
     * the last frame of the outgoing song typically has a short block size (<4096).
     * Under fixed-blocksize strategy (bit 0 = 0), a renderer computes sample PTS as
     * frame_number * 4096 — so one short frame at a song boundary causes the next
     * frame's PTS to jump backwards or drift, triggering a rebuffer.
     *
     * Fix: convert every frame to variable-blocksize strategy (p[1] |= 0x01) and
     * encode the running exact sample count (`nextSampleNumber`) in the UTF-8 slot,
     * then recompute CRC-8 and CRC-16. Subframe (audio) bytes are copied untouched.
     */
    private fun renumber(p: ByteArray): ByteArray {
        if (p.size < 8) return p
        val bsCode = (p[2].toInt() ushr 4) and 0x0F
        val srCode = p[2].toInt() and 0x0F
        val numLen = utf8Length(p[4].toInt() and 0xFF)
        if (numLen == 0) return p
        var pos = 4 + numLen
        if (p.size < pos + 2 + 1 + 2) return p
        val blockSize = when (bsCode) {
            1 -> 192
            in 2..5 -> 576 shl (bsCode - 2)
            6 -> (p[pos].toInt() and 0xFF) + 1
            7 -> (((p[pos].toInt() and 0xFF) shl 8) or (p[pos + 1].toInt() and 0xFF)) + 1
            in 8..15 -> 256 shl (bsCode - 8)
            else -> return p
        }
        pos += when (bsCode) { 6 -> 1; 7 -> 2; else -> 0 }
        pos += when (srCode) { 12 -> 1; 13, 14 -> 2; else -> 0 }
        // pos is now the CRC-8 byte; the frame must hold it plus a CRC-16.
        if (p.size < pos + 1 + 2) return p
        if (crc8(p, 0, pos) != (p[pos].toInt() and 0xFF)) return p

        val sampleNumber = nextSampleNumber
        nextSampleNumber += blockSize

        val coded = encodeUtf8Number(sampleNumber)
        val buf = ByteArrayOutputStream(p.size + 8)
        buf.write(p[0].toInt())
        buf.write((p[1].toInt() and 0xFF) or 0x01)      // variable-blocksize strategy
        buf.write(p, 2, 2)
        buf.write(coded)
        buf.write(p, 4 + numLen, pos - (4 + numLen))   // block size / sample rate extras
        val header = buf.toByteArray()
        buf.write(crc8(header, 0, header.size))
        buf.write(p, pos + 1, p.size - 2 - (pos + 1))   // subframes + padding
        val frame = buf.toByteArray()
        val c16 = crc16(frame)
        val result = frame.copyOf(frame.size + 2)
        result[frame.size] = (c16 ushr 8).toByte()
        result[frame.size + 1] = c16.toByte()
        return result
    }

    private var nextSampleNumber = 0L

    private fun utf8Length(first: Int): Int = when {
        (first and 0x80) == 0 -> 1
        (first and 0xE0) == 0xC0 -> 2
        (first and 0xF0) == 0xE0 -> 3
        (first and 0xF8) == 0xF0 -> 4
        (first and 0xFC) == 0xF8 -> 5
        (first and 0xFE) == 0xFC -> 6
        first == 0xFE -> 7
        else -> 0
    }

    private fun encodeUtf8Number(v: Long): ByteArray {
        if (v < 0x80L) return byteArrayOf(v.toByte())
        val len = when {
            v < 0x800L -> 2
            v < 0x10000L -> 3
            v < 0x200000L -> 4
            v < 0x4000000L -> 5
            v < 0x80000000L -> 6
            else -> 7
        }
        val bytes = ByteArray(len)
        var x = v
        for (i in len - 1 downTo 1) {
            bytes[i] = (0x80 or (x and 0x3F).toInt()).toByte()
            x = x ushr 6
        }
        val prefix = if (len == 7) 0xFE else ((0xFF00 ushr len) and 0xFF)
        bytes[0] = (prefix or x.toInt()).toByte()
        return bytes
    }

    private fun crc8(b: ByteArray, off: Int, len: Int): Int {
        var c = 0
        for (i in off until off + len) c = CRC8[(c xor (b[i].toInt() and 0xFF)) and 0xFF]
        return c
    }

    private fun crc16(b: ByteArray): Int {
        var c = 0
        for (x in b) c = ((c shl 8) xor CRC16[((c ushr 8) xor (x.toInt() and 0xFF)) and 0xFF]) and 0xFFFF
        return c
    }

    private fun isMappingHeader(p: ByteArray): Boolean =
        p.size >= 13 &&
            p[0] == 0x7F.toByte() &&
            p[1] == 'F'.code.toByte() && p[2] == 'L'.code.toByte() &&
            p[3] == 'A'.code.toByte() && p[4] == 'C'.code.toByte() &&
            p[9] == 'f'.code.toByte() && p[10] == 'L'.code.toByte() &&
            p[11] == 'a'.code.toByte() && p[12] == 'C'.code.toByte()

    /** FLAC frame sync: 14 bits 0b11111111111110, then a reserved 0 bit. */
    private fun isFrame(p: ByteArray): Boolean =
        p.size >= 2 && p[0] == 0xFF.toByte() && (p[1].toInt() and 0xFE) == 0xF8

    private companion object {
        const val TAG = "SubwaveRelay"
        const val OGGS = 0x4F676753 // "OggS"
        const val MAX_PACKET = 4 * 1024 * 1024

        /** FLAC header CRC-8, polynomial x^8 + x^2 + x + 1 (0x07), init 0. */
        val CRC8 = IntArray(256) { i ->
            var c = i
            repeat(8) { c = if ((c and 0x80) != 0) ((c shl 1) xor 0x07) and 0xFF else (c shl 1) and 0xFF }
            c
        }

        /** FLAC frame CRC-16, polynomial x^16 + x^15 + x^2 + 1 (0x8005), init 0. */
        val CRC16 = IntArray(256) { i ->
            var c = i shl 8
            repeat(8) { c = if ((c and 0x8000) != 0) ((c shl 1) xor 0x8005) and 0xFFFF else (c shl 1) and 0xFFFF }
            c
        }
    }
}

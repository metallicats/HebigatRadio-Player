package com.getsubwave.dlnacast

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
                out.write(p, 14, 3 + 34)                     // block length + body
                headerWritten = true
            }
            return
        }
        if (headerWritten && isFrame(p)) out.write(p)
        // Anything else is a metadata block: dropped on purpose.
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
        const val OGGS = 0x4F676753 // "OggS"
        const val MAX_PACKET = 4 * 1024 * 1024
    }
}

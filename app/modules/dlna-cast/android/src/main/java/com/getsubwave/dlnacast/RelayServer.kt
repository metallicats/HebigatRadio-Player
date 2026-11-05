package com.getsubwave.dlnacast

import android.content.Context
import android.net.wifi.WifiManager
import android.os.PowerManager
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.Collections
import kotlin.concurrent.thread

/** DLNA content features for an unseekable live stream. Keep in sync with
 *  LIVE_DLNA_FEATURES in src/dlna/upnpClient.ts. */
internal const val LIVE_DLNA_FEATURES =
    "DLNA.ORG_OP=00;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"

/**
 * A tiny HTTP server on the phone that the DLNA renderer pulls from. For every
 * GET it opens the station's Ogg-FLAC mount and streams it back as native FLAC
 * (FlacRemuxer), with live-stream headers: no Content-Length, no Accept-Ranges,
 * Connection: close (Icecast-style, which this AVR already plays for MP3).
 */
internal object RelayServer {
    private const val TAG = "SubwaveRelay"

    @Volatile private var server: ServerSocket? = null
    @Volatile private var upstreamUrl: String = ""
    @Volatile private var upstreamHeaders: Map<String, String> = emptyMap()
    private val clients: MutableSet<Socket> = Collections.synchronizedSet(mutableSetOf())
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null

    /** Start (or re-point) the relay; returns the local TCP port. */
    @Synchronized
    fun start(context: Context, url: String, headers: Map<String, String>): Int {
        upstreamUrl = url
        upstreamHeaders = headers
        server?.let { if (!it.isClosed) return it.localPort }
        val ss = ServerSocket(0)
        server = ss
        acquireLocks(context)
        thread(isDaemon = true, name = "subwave-relay-accept") { acceptLoop(ss) }
        Log.i(TAG, "relay listening on port ${ss.localPort}")
        return ss.localPort
    }

    @Synchronized
    fun stop() {
        runCatching { server?.close() }
        server = null
        synchronized(clients) {
            clients.forEach { runCatching { it.close() } }
            clients.clear()
        }
        releaseLocks()
    }

    private fun acceptLoop(ss: ServerSocket) {
        while (!ss.isClosed) {
            val client = try {
                ss.accept()
            } catch (_: IOException) {
                break
            }
            clients.add(client)
            thread(isDaemon = true, name = "subwave-relay-client") {
                try {
                    handleClient(client)
                } catch (e: Exception) {
                    Log.d(TAG, "client ended: ${e.message}")
                } finally {
                    runCatching { client.close() }
                    clients.remove(client)
                }
            }
        }
    }

    private fun handleClient(sock: Socket) {
        sock.tcpNoDelay = true
        sock.soTimeout = 15_000
        val input = BufferedInputStream(sock.getInputStream())
        val requestLine = readLine(input) ?: return
        while (true) {
            val line = readLine(input) ?: break
            if (line.isEmpty()) break
        }
        sock.soTimeout = 0
        Log.i(TAG, "renderer request: $requestLine")

        val method = requestLine.substringBefore(' ').uppercase()
        val out = BufferedOutputStream(sock.getOutputStream(), 16 * 1024)
        if (method != "GET" && method != "HEAD") {
            writeStatus(out, "405 Method Not Allowed")
            return
        }
        if (method == "HEAD") {
            writeOkHeaders(out)
            out.flush()
            return
        }

        val conn = (URL(upstreamUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "SUBWAVE-DLNA-Relay/1.0")
            upstreamHeaders.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "upstream answered $code")
                writeStatus(out, "502 Bad Gateway")
                return
            }
            writeOkHeaders(out)
            out.flush()
            FlacRemuxer(BufferedInputStream(conn.inputStream, 64 * 1024), out).run()
        } finally {
            conn.disconnect()
        }
    }

    private fun writeOkHeaders(out: OutputStream) {
        val headers = "HTTP/1.1 200 OK\r\n" +
            "Content-Type: audio/flac\r\n" +
            "Cache-Control: no-cache, no-store\r\n" +
            "Pragma: no-cache\r\n" +
            "Connection: close\r\n" +
            "transferMode.dlna.org: Streaming\r\n" +
            "contentFeatures.dlna.org: $LIVE_DLNA_FEATURES\r\n" +
            "Server: Android UPnP/1.0 SUBWAVE/1.0\r\n" +
            "\r\n"
        out.write(headers.toByteArray(Charsets.US_ASCII))
    }

    private fun writeStatus(out: OutputStream, status: String) {
        out.write("HTTP/1.1 $status\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".toByteArray(Charsets.US_ASCII))
        out.flush()
    }

    private fun readLine(input: InputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b < 0) return if (sb.isEmpty()) null else sb.toString()
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            if (sb.length < 8192) sb.append(b.toChar())
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks(context: Context) {
        val app = context.applicationContext
        if (wifiLock == null) {
            val wm = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "subwave-relay-wifi").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        if (wakeLock == null) {
            val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "subwave:relay").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseLocks() {
        wifiLock?.let { if (it.isHeld) it.release() }
        wifiLock = null
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }
}

package com.getsubwave.dlnacast

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class DlnaCastModule : Module() {
    private var discoveryJob: Job? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun definition() = ModuleDefinition {
        Name("DlnaCast")
        Events("onDeviceDiscovered")

        Function("startDiscovery") {
            startSsdpDiscovery()
        }

        Function("stopDiscovery") {
            stopSsdpDiscovery()
        }
    }

    private fun startSsdpDiscovery() {
        stopSsdpDiscovery()

        val context = appContext.reactContext ?: return
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifiManager.createMulticastLock("subwave-ssdp-lock").apply {
            setReferenceCounted(true)
            acquire()
        }

        discoveryJob = CoroutineScope(Dispatchers.IO).launch {
            try {
                val ssdpGroup = InetAddress.getByName("239.255.255.250")
                val port = 1900
                val socket = DatagramSocket()
                socket.soTimeout = 4000

                val searchTargets = listOf(
                    "urn:schemas-upnp-org:device:MediaRenderer:1",
                    "urn:schemas-upnp-org:service:AVTransport:1",
                    "ssdp:all"
                )

                for (target in searchTargets) {
                    val mSearch = "M-SEARCH * HTTP/1.1\r\n" +
                            "HOST: 239.255.255.250:1900\r\n" +
                            "MAN: \"ssdp:discover\"\r\n" +
                            "MX: 3\r\n" +
                            "ST: $target\r\n\r\n"

                    val bytes = mSearch.toByteArray(Charsets.UTF_8)
                    val packet = DatagramPacket(bytes, bytes.size, ssdpGroup, port)
                    socket.send(packet)
                }

                val buffer = ByteArray(4096)
                val responsePacket = DatagramPacket(buffer, buffer.size)
                val discoveredLocations = mutableSetOf<String>()

                val deadline = System.currentTimeMillis() + 8000
                while (isActive && System.currentTimeMillis() < deadline) {
                    try {
                        socket.receive(responsePacket)
                        val text = String(responsePacket.data, 0, responsePacket.length, Charsets.UTF_8)
                        val location = extractHeader(text, "LOCATION")
                        val usn = extractHeader(text, "USN")

                        if (!location.isNullOrBlank() && discoveredLocations.add(location)) {
                            this@DlnaCastModule.sendEvent("onDeviceDiscovered", mapOf(
                                "location" to location,
                                "usn" to (usn ?: location)
                            ))
                        }
                    } catch (_: java.net.SocketTimeoutException) {
                        // socket timed out waiting for packets, loop continues until deadline
                    }
                }
                socket.close()
            } catch (_: Exception) {
                // Ignore socket closures on cancellation
            } finally {
                multicastLock?.let { if (it.isHeld) it.release() }
            }
        }
    }

    private fun stopSsdpDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = null
        multicastLock?.let { if (it.isHeld) it.release() }
    }

    private fun extractHeader(response: String, name: String): String? {
        val lines = response.split("\r\n")
        for (line in lines) {
            val idx = line.indexOf(':')
            if (idx > 0 && line.substring(0, idx).trim().equals(name, ignoreCase = true)) {
                return line.substring(idx + 1).trim()
            }
        }
        return null
    }
}

package art.querencia.track.data

import java.net.HttpURLConnection
import java.net.URL

class ApiException(message: String, val code: Int = 0) : Exception(message)

/** Plain HttpURLConnection: no networking library for three endpoints. */
object TrackApi {
    private const val MAX_BYTES = 4 * 1024 * 1024

    fun get(base: String, path: String, token: String): String = call("GET", base, path, token, null)

    fun post(base: String, path: String, token: String, json: String): String =
        call("POST", base, path, token, json)

    private fun call(method: String, base: String, path: String, token: String, body: String?): String {
        if (!base.startsWith("https://")) throw ApiException("Server address must start with https://")
        val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 25_000
            instanceFollowRedirects = false
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.use { s -> String(s.readNBytes(MAX_BYTES)) }.orEmpty()
            if (code in 200..299) return text
            throw ApiException(
                when (code) {
                    401 -> "Token rejected. Check it in Settings."
                    429 -> "Too many attempts. Try again later."
                    503 -> "Server has no API token configured."
                    in 300..399 -> "Server redirected; check the address."
                    else -> "Server returned $code."
                },
                code,
            )
        } finally {
            conn.disconnect()
        }
    }
}

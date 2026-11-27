package art.querencia.track.data

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import javax.net.ssl.HttpsURLConnection

class ApiException(message: String, val code: Int = 0) : Exception(message)

/** HTTPS only; redirects cannot carry the credential or local edits elsewhere. */
object TrackApi {
    private const val MAX_BYTES = 4 * 1024 * 1024
    private val paths = setOf("/api/v1/pull", "/api/v1/push", "/api/v1/today", "/api/integrations/activity")

    fun get(base: String, path: String, token: String): String = call("GET", base, path, token, null)

    fun post(base: String, path: String, token: String, json: String): String =
        call("POST", base, path, token, json)

    private fun call(method: String, base: String, path: String, token: String, body: String?): String {
        val connection = TrackConnection.forPairing(base, token, "", null)
        require(path in paths) { "Unknown Track mobile API route." }
        val conn = (URI(connection.origin + path).toURL().openConnection() as HttpsURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 25_000
            useCaches = false
            instanceFollowRedirects = false
            setRequestProperty("Authorization", "Bearer ${connection.token}")
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (body != null) {
                val bytes = body.toByteArray(Charsets.UTF_8)
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(bytes.size)
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(bytes) }
            }
            val code = conn.responseCode
            if (code !in 200..299) throw ApiException(
                when (code) {
                    HttpURLConnection.HTTP_UNAUTHORIZED, HttpURLConnection.HTTP_FORBIDDEN -> "Token rejected. Check it in Settings."
                    429 -> "Too many attempts. Try again later."
                    HttpURLConnection.HTTP_UNAVAILABLE -> "Server unavailable or not configured for phone sync."
                    in 300..399 -> "Server redirected; check the address."
                    else -> "Server returned $code."
                },
                code,
            )
            if (!conn.contentType.orEmpty().substringBefore(';').trim().equals("application/json", ignoreCase = true)) {
                throw ApiException("This address did not return Track JSON.", code)
            }
            if (conn.contentLengthLong > MAX_BYTES) throw ApiException("Track response is too large.", code)
            // InputStream.readNBytes is missing on older supported Android releases.
            return conn.inputStream.use { stream ->
                val bytes = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = stream.read(buffer)
                    if (count < 0) break
                    if (bytes.size() + count > MAX_BYTES) throw ApiException("Track response is too large.", code)
                    bytes.write(buffer, 0, count)
                }
                String(bytes.toByteArray(), Charsets.UTF_8)
            }
        } finally {
            conn.disconnect()
        }
    }
}

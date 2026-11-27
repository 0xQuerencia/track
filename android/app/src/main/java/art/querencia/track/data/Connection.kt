package art.querencia.track.data

import java.net.URI
import java.util.Locale

/** The mobile cache/outbox is single-owner. Its first verified HTTPS origin stays pinned. */
internal class TrackConnection private constructor(val origin: String, val token: String) {
    companion object {
        fun origin(raw: String): String {
            val message = "Enter an HTTPS server origin, without a path, query, or credentials."
            val uri = try { URI(raw.trim()) } catch (_: java.net.URISyntaxException) {
                throw IllegalArgumentException(message)
            }
            val host = uri.host ?: throw IllegalArgumentException(message)
            require(uri.scheme.equals("https", ignoreCase = true) &&
                uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
                uri.rawPath in listOf("", "/") && !uri.rawAuthority.orEmpty().endsWith(":") &&
                (uri.port == -1 || uri.port in 1..65535)) { message }
            val port = if (uri.port in listOf(-1, 443)) -1 else uri.port
            return URI("https", null, host.lowercase(Locale.ROOT), port, null, null, null).toASCIIString()
        }

        fun forPairing(server: String, typedToken: String, previousServer: String, savedToken: String?): TrackConnection {
            val candidate = origin(server)
            if (previousServer.isNotBlank()) {
                val existing = runCatching { origin(previousServer) }.getOrNull()
                require(existing == candidate) {
                    "This install is tied to its current server. Sync or back up your changes, then clear Track app storage before switching servers."
                }
            }
            val token = typedToken.trim().ifEmpty { savedToken.orEmpty() }
            require(token.length in 24..300 && token.all { it in '!'..'~' }) {
                "Enter your Track phone API token (at least 24 characters, no spaces)."
            }
            return TrackConnection(candidate, token)
        }
    }
}

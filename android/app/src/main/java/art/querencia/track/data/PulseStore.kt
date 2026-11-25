package art.querencia.track.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.UUID

data class PulseConfig(val generation: String, val server: String, val token: String, val since: Long)
data class PulseQueue(val checkpoint: Long, val events: List<UsageInterval>, val dropped: Int)
data class PulseStatus(val enabled: Boolean, val server: String, val pending: Int, val dropped: Int, val notice: String)
private const val MAX_QUEUE = 5000

/** Separate opt-in credential and queue; never reuse the legacy phone sync token. */
class PulseStore(context: Context) {
    private val sp = context.getSharedPreferences("track_pulse", Context.MODE_PRIVATE)
    companion object { private val lock = Any() }

    fun config(): PulseConfig? = synchronized(lock) {
        if (!sp.getBoolean("enabled", false)) return@synchronized null
        val generation = sp.getString("generation", null) ?: return@synchronized null
        val server = sp.getString("server", null) ?: return@synchronized null
        val token = sp.getString("token", null)?.let(SecretStore::decrypt) ?: return@synchronized null
        PulseConfig(generation, server, token, sp.getLong("since", 0))
    }

    fun enable(serverRaw: String, tokenRaw: String, now: Long = System.currentTimeMillis()) = synchronized(lock) {
        val uri = URI(serverRaw.trim())
        require(uri.scheme == "https" && uri.host != null && uri.userInfo == null &&
            uri.rawQuery == null && uri.rawFragment == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) { "Use a bare HTTPS Track server origin." }
        val token = tokenRaw.trim()
        require(Regex("^trk_[A-Za-z0-9_-]{43}$").matches(token)) { "Use a dedicated activity:write token." }
        require(sp.edit().clear()
            .putBoolean("enabled", true).putString("generation", UUID.randomUUID().toString())
            .putString("server", "https://" + uri.rawAuthority).putString("token", SecretStore.encrypt(token))
            .putLong("since", now).putLong("checkpoint", now).putString("queue", "[]").commit()) { "Could not save Pulse settings." }
    }

    fun disable() = synchronized(lock) { sp.edit().clear().commit() }

    fun queue(generation: String): PulseQueue? = synchronized(lock) {
        if (config()?.generation != generation) return@synchronized null
        val json = JSONArray(sp.getString("queue", "[]"))
        val items = (0 until json.length()).map { i ->
            val x = json.getJSONObject(i)
            UsageInterval(x.getString("eventId"), x.getLong("startMs"), x.getLong("endMs"))
        }
        PulseQueue(sp.getLong("checkpoint", 0), items, sp.getInt("dropped", 0))
    }

    fun save(generation: String, checkpoint: Long, events: List<UsageInterval>, dropped: Int): Boolean = synchronized(lock) {
        if (config()?.generation != generation) return@synchronized false
        val unique = events.distinctBy { it.eventId }.sortedBy { it.startMs }
        val kept = unique.takeLast(MAX_QUEUE)
        val json = JSONArray()
        kept.forEach { e -> json.put(JSONObject().put("eventId", e.eventId).put("startMs", e.startMs).put("endMs", e.endMs)) }
        sp.edit().putLong("checkpoint", checkpoint).putString("queue", json.toString())
            .putInt("dropped", dropped + unique.size - kept.size).commit()
    }

    fun notice(generation: String, text: String) = synchronized(lock) {
        if (config()?.generation == generation) sp.edit().putString("notice", text).apply()
    }

    fun status(): PulseStatus = synchronized(lock) {
        val c = config()
        val q = c?.let { queue(it.generation) }
        PulseStatus(c != null, c?.server.orEmpty(), q?.events?.size ?: 0, q?.dropped ?: 0,
            sp.getString("notice", "").orEmpty())
    }
}

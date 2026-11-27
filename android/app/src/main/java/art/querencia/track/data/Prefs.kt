package art.querencia.track.data

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("track", Context.MODE_PRIVATE)

    val serverUrl: String
        get() = sp.getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER

    val token: String?
        get() = sp.getString("token", null)?.let(SecretStore::decrypt)

    /** Write the verified origin and encrypted credential in one preference transaction. */
    internal fun saveConnection(connection: TrackConnection) {
        val encrypted = SecretStore.encrypt(connection.token)
        check(sp.edit().putString("server", connection.origin).putString("token", encrypted).commit()) {
            "Couldn't save this connection."
        }
    }

    /** Line-style (monochrome) icons instead of the app's coloured ones. */
    var monoIcons: Boolean
        get() = sp.getBoolean("mono", true)
        set(v) = sp.edit { putBoolean("mono", v) }

    var hidden: Set<String>
        get() = sp.getStringSet("hidden", emptySet()) ?: emptySet()
        set(v) = sp.edit { putStringSet("hidden", v) }

    /** Ordered package names pinned to the dock. Null until the user customises it. */
    var dock: List<String>?
        get() = sp.getString("dock", null)?.split(',')?.filter { it.isNotBlank() }
        set(v) = sp.edit { if (v == null) remove("dock") else putString("dock", v.joinToString(",")) }

    companion object {
        const val DEFAULT_SERVER = ""
    }
}

package art.querencia.track.data

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("track", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(v) = sp.edit { putString("server", v.trim().trimEnd('/')) }

    var token: String?
        get() = sp.getString("token", null)?.let(SecretStore::decrypt)
        set(v) = sp.edit {
            if (v.isNullOrBlank()) remove("token") else putString("token", SecretStore.encrypt(v.trim()))
        }

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

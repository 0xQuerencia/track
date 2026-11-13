package art.querencia.track.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class AppEntry(val packageName: String, val activity: String, val label: String)

/** Lists launchable apps and loads their icons on demand, with a small cache. */
class AppsRepo(private val context: Context) {
    private val pm: PackageManager = context.packageManager
    private val icons = LruCache<String, ImageBitmap>(160)

    suspend fun load(): List<AppEntry> = withContext(Dispatchers.IO) {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        pm.queryIntentActivities(intent, 0)
            .filter { it.activityInfo.packageName != context.packageName }
            .map { it.toEntry() }
            .sortedBy { it.label.lowercase() }
    }

    private fun ResolveInfo.toEntry() = AppEntry(
        packageName = activityInfo.packageName,
        activity = activityInfo.name,
        label = loadLabel(pm).toString(),
    )

    suspend fun icon(packageName: String): ImageBitmap? {
        icons.get(packageName)?.let { return it }
        return withContext(Dispatchers.IO) {
            runCatching {
                val d: Drawable = pm.getApplicationIcon(packageName)
                d.toBitmap(128, 128).asImageBitmap()
            }.getOrNull()?.also { icons.put(packageName, it) }
        }
    }

    fun launch(app: AppEntry) {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setClassName(app.packageName, app.activity)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        runCatching { context.startActivity(intent) }
    }

    fun appInfo(packageName: String) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }

    fun uninstall(packageName: String) {
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }

    /** Sensible dock defaults: dialer, messages, browser, camera, when installed. */
    fun defaultDock(all: List<AppEntry>): List<String> {
        val wanted = listOf(
            Intent(Intent.ACTION_DIAL),
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_MESSAGING),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")),
            Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE),
        )
        val known = all.map { it.packageName }.toSet()
        return wanted.mapNotNull { pm.resolveActivity(it, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName }
            .filter { it in known }
            .distinct()
    }
}

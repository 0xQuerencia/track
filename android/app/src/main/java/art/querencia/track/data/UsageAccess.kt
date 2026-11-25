package art.querencia.track.data

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.os.UserManager
import android.provider.Settings

@Suppress("DEPRECATION")
object UsageAccess {
    fun granted(context: Context): Boolean = runCatching {
        val ops = context.getSystemService(AppOpsManager::class.java)
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) ==
            AppOpsManager.MODE_ALLOWED
    }.getOrDefault(false)

    fun openSettings(context: Context) {
        context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** No query until the user has enabled collection and Android granted access. */
    fun query(context: Context, since: Long, until: Long): List<UsageMark> {
        require(granted(context)) { "Usage access is not granted." }
        require(context.getSystemService(UserManager::class.java).isUserUnlocked) { "Device is locked." }
        val manager = context.getSystemService(UsageStatsManager::class.java)
        val events = manager.queryEvents(since, until) ?: return emptyList()
        val marks = ArrayList<UsageMark>()
        val e = UsageEvents.Event()
        var seen = 0
        while (events.hasNextEvent()) {
            if (++seen > 100_000) error("Usage event window too large")
            if (!events.getNextEvent(e)) break
            val kind = when (e.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND -> UsageKind.Foreground
                UsageEvents.Event.MOVE_TO_BACKGROUND -> UsageKind.Background
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> UsageKind.ScreenOff
                UsageEvents.Event.SCREEN_INTERACTIVE -> UsageKind.ScreenOn
                UsageEvents.Event.KEYGUARD_SHOWN -> UsageKind.Locked
                UsageEvents.Event.KEYGUARD_HIDDEN -> UsageKind.Unlocked
                UsageEvents.Event.DEVICE_SHUTDOWN -> UsageKind.Shutdown
                else -> null
            } ?: continue
            val pkg = if (kind == UsageKind.Foreground || kind == UsageKind.Background) e.packageName else null
            marks.add(UsageMark(e.timeStamp, kind, pkg))
        }
        return marks
    }
}

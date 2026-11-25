package art.querencia.track.data

import java.security.MessageDigest

enum class UsageKind { Foreground, Background, ScreenOff, ScreenOn, Locked, Unlocked, Shutdown }
data class UsageMark(val at: Long, val kind: UsageKind, val pkg: String? = null)
data class UsageInterval(val eventId: String, val startMs: Long, val endMs: Long)

private const val DAY_MS = 86_400_000L
private fun intervalId(start: Long, end: Long): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest("android:$start:$end".toByteArray())
    return "and-" + bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
}

/** Pairs explicit events only. A still-open or missing activity is not inferred.
 * Package names are temporary matching keys and never part of the returned data. */
fun usageIntervals(marks: List<UsageMark>, since: Long, until: Long): List<UsageInterval> {
    require(since >= 0 && until >= since)
    var pkg: String? = null
    var started = 0L
    var interactive = true
    var locked = false
    val result = LinkedHashMap<String, UsageInterval>()
    fun close(at: Long) {
        if (pkg != null) {
            val a = maxOf(started, since)
            val b = minOf(at, until)
            if (b > a && b - a <= DAY_MS) {
                val id = intervalId(a, b)
                result[id] = UsageInterval(id, a, b)
            }
        }
        pkg = null
    }
    for (mark in marks.filter { it.at in since..until }.sortedBy { it.at }) {
        when (mark.kind) {
            UsageKind.Foreground -> {
                if (mark.pkg.isNullOrBlank() || !interactive || locked) continue
                if (pkg != mark.pkg) {
                    close(mark.at)
                    pkg = mark.pkg
                    started = mark.at
                }
            }
            UsageKind.Background -> if (pkg != null && pkg == mark.pkg) close(mark.at)
            UsageKind.ScreenOff -> { close(mark.at); interactive = false }
            UsageKind.ScreenOn -> interactive = true
            UsageKind.Locked -> { close(mark.at); locked = true }
            UsageKind.Unlocked -> locked = false
            UsageKind.Shutdown -> { close(mark.at); interactive = false }
        }
    }
    // Do not close an open interval at "now": the device may be idle or events may be missing.
    return result.values.toList()
}

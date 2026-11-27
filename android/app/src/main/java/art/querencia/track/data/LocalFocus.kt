package art.querencia.track.data

/** Manual phone timer. It is not evidence of monitored or uninterrupted focus. */
internal data class LocalFocus(
    val date: String,
    val label: String,
    val plannedMinutes: Int,
    val startedElapsedMs: Long,
    val saving: Boolean = false,
) {
    init {
        require(plannedMinutes in 1..180)
        require(startedElapsedMs >= 0L && startedElapsedMs <= Long.MAX_VALUE - plannedMinutes * 60_000L)
    }

    private val totalMs get() = plannedMinutes * 60_000L

    fun remainingSeconds(nowElapsedMs: Long): Long = (totalMs - elapsed(nowElapsedMs) + 999L) / 1000L
    fun completedMinutes(nowElapsedMs: Long): UInt = (elapsed(nowElapsedMs) / 60_000L).toUInt()
    private fun elapsed(nowElapsedMs: Long): Long =
        if (nowElapsedMs <= startedElapsedMs) 0L else (nowElapsedMs - startedElapsedMs).coerceAtMost(totalMs)
}

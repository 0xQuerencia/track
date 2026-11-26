package art.querencia.track.data

/** Local launcher-only voluntary protection. The monotonic clock cannot be extended by wall-clock changes. */
data class FocusGuard(val packages: Set<String> = emptySet(), val untilElapsedMs: Long = 0L) {
    fun active(nowElapsedMs: Long): Boolean = nowElapsedMs >= 0 && untilElapsedMs > nowElapsedMs
    fun blocks(packageName: String, nowElapsedMs: Long): Boolean = active(nowElapsedMs) && packageName in packages
    fun toggle(packageName: String): FocusGuard = copy(
        packages = if (packageName in packages) packages - packageName else packages + packageName
    )
    fun start(minutes: Int, nowElapsedMs: Long): FocusGuard {
        require(minutes in 1..180 && nowElapsedMs >= 0 && nowElapsedMs <= Long.MAX_VALUE - 180 * 60_000L)
        require(packages.isNotEmpty()) { "Choose at least one app." }
        return copy(untilElapsedMs = nowElapsedMs + minutes * 60_000L)
    }
    fun stop(): FocusGuard = copy(untilElapsedMs = 0)
}

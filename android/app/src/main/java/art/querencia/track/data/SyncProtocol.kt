package art.querencia.track.data

data class SyncReport(val pending: UInt, val rejected: UInt) {
    val message: String
        get() = when {
            rejected > 0u && pending > 0u -> "$rejected local changes refused · $pending still queued."
            rejected > 0u -> "$rejected local changes refused by the server."
            pending > 0u -> "$pending local changes waiting to sync."
            else -> "Data synced."
        }
}

internal data class BatchProgress(val applied: UInt, val rejected: UInt)

/** Bounded drain. Transient ACKs leave pending work intact and stop the current sync. */
internal fun drainOutbox(
    pending: () -> UInt,
    sendBatch: () -> BatchProgress,
    maxBatches: Int = 20,
): SyncReport {
    require(maxBatches in 1..20)
    var rejected = 0u
    for (batch in 0 until maxBatches) {
        if (pending() == 0u) break
        val result = sendBatch()
        rejected += result.rejected
        if (result.applied == 0u && result.rejected == 0u) break
    }
    return SyncReport(pending(), rejected)
}

/** The only path to saving a candidate: first fetch and validate its snapshot. */
internal fun verifyAndSave(
    candidate: TrackConnection,
    fetch: (TrackConnection) -> String,
    validate: (String) -> Unit,
    save: (TrackConnection) -> Unit,
): String {
    val snapshot = fetch(candidate)
    validate(snapshot)
    save(candidate)
    return snapshot
}

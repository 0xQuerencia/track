package art.querencia.track.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import uniffi.track_core.Engine

sealed interface SyncState {
    data object Idle : SyncState
    data object Running : SyncState
    data class Failed(val message: String) : SyncState
}

/** Moves JSON between the server and the Rust engine: push the queue, then pull. */
class SyncManager(private val engine: Engine, private val prefs: Prefs) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow<SyncState>(SyncState.Idle)
    val state: StateFlow<SyncState> = _state

    /** Bumps after each successful sync so screens know to reload. */
    private val _version = MutableStateFlow(0)
    val version: StateFlow<Int> = _version

    suspend fun sync(): Result<Unit> = mutex.withLock {
        withContext(Dispatchers.IO) {
            val token = prefs.token
            if (token.isNullOrBlank()) {
                return@withContext fail("Add your API token in Settings.")
            }
            _state.value = SyncState.Running
            runCatching {
                val base = prefs.serverUrl
                // A batch is at most 100 ops; stop if the server makes no progress.
                repeat(20) {
                    if (engine.pendingCount() == 0u) return@repeat
                    val reply = TrackApi.post(base, "/api/v1/push", token, engine.pendingOps(100u))
                    val summary = engine.ack(reply)
                    if (summary.applied + summary.rejected == 0u) return@repeat
                }
                engine.applyPull(TrackApi.get(base, "/api/v1/pull", token))
            }.fold(
                onSuccess = {
                    _state.value = SyncState.Idle
                    _version.value += 1
                    Result.success(Unit)
                },
                onFailure = { fail(it.message ?: "Sync failed.") },
            )
        }
    }

    private fun fail(message: String): Result<Unit> {
        _state.value = SyncState.Failed(message)
        return Result.failure(ApiException(message))
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as art.querencia.track.TrackApp
        return if (app.sync.sync().isSuccess) Result.success() else Result.retry()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork("track-sync", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}

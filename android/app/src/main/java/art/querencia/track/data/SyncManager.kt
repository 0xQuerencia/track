package art.querencia.track.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import uniffi.track_core.CoreException
import uniffi.track_core.Engine
import kotlin.coroutines.coroutineContext

sealed interface SyncState {
    data object Idle : SyncState
    data object Running : SyncState
    data class Waiting(val report: SyncReport) : SyncState
    data class Failed(val message: String) : SyncState
}

internal class ManualSyncRequired(message: String) : Exception(message)

/** The same mutex protects foreground, background and connection edits. */
class SyncManager(private val engine: Engine, private val prefs: Prefs) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow<SyncState>(SyncState.Idle)
    val state: StateFlow<SyncState> = _state
    private val _version = MutableStateFlow(0)
    val version: StateFlow<Int> = _version

    suspend fun sync(): Result<SyncReport> = runSync {
        val server = prefs.serverUrl
        val saved = prefs.token
        if (server.isBlank() || saved.isNullOrBlank()) throw ManualSyncRequired("Connect to Track in Settings.")
        val connection = TrackConnection.forPairing(server, "", server, saved)
        transfer(connection)
    }

    suspend fun pairAndSync(server: String, typedToken: String): Result<SyncReport> = runSync {
        val candidate = TrackConnection.forPairing(server, typedToken, prefs.serverUrl, prefs.token)
        // Never send any outbox entries or replace the stored credential until
        // this connection returns a complete authenticated Track snapshot.
        val context = coroutineContext
        verifyAndSave(
            candidate,
            fetch = { TrackApi.get(it.origin, "/api/v1/pull", it.token) },
            apply = { context.ensureActive(); engine.applyPull(it) },
            save = prefs::saveConnection,
        )
        _version.value += 1
        try {
            transfer(candidate, alreadyPulled = true)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            throw ManualSyncRequired("Connection verified, but sync did not finish. " + messageFor(error))
        }
    }

    private suspend fun transfer(connection: TrackConnection, alreadyPulled: Boolean = false): SyncReport {
        val context = coroutineContext
        var sent = false
        val report = drainOutbox(engine::pendingCount, sendBatch = {
            context.ensureActive()
            val batch = engine.pendingOps(100u)
            val reply = TrackApi.post(connection.origin, "/api/v1/push", connection.token, batch)
            context.ensureActive()
            val summary = engine.ack(batch, reply)
            sent = true
            BatchProgress(summary.applied, summary.rejected)
        })
        context.ensureActive()
        if (!alreadyPulled || sent) {
            val snapshot = TrackApi.get(connection.origin, "/api/v1/pull", connection.token)
            context.ensureActive()
            engine.applyPull(snapshot)
        }
        return report
    }

    private suspend fun runSync(block: suspend () -> SyncReport): Result<SyncReport> = mutex.withLock {
        withContext(Dispatchers.IO) {
            _state.value = SyncState.Running
            try {
                val report = block()
                _state.value = if (report.pending == 0u && report.rejected == 0u) SyncState.Idle else SyncState.Waiting(report)
                _version.value += 1
                Result.success(report)
            } catch (cancelled: CancellationException) {
                _state.value = SyncState.Idle
                throw cancelled
            } catch (error: Exception) {
                _state.value = SyncState.Failed(messageFor(error))
                Result.failure(error)
            }
        }
    }

    companion object {
        internal fun messageFor(error: Throwable): String = when (error) {
            is ManualSyncRequired, is ApiException, is IllegalArgumentException ->
                error.message ?: "Check your Track connection settings."
            is CoreException.Payload -> "Track returned an incomplete or invalid reply. Local data was kept."
            is IOException -> "Couldn't reach Track. Check your connection and try again."
            else -> "Sync failed. Try again from Settings."
        }
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as art.querencia.track.TrackApp
        return app.sync.sync().fold(
            onSuccess = { if (it.pending > 0u) Result.retry() else Result.success() },
            onFailure = { error ->
                if (error is IOException || error is ApiException &&
                    (error.code == 408 || error.code == 429 || error.code in listOf(500, 502, 504))) {
                    Result.retry()
                } else Result.success() // Settings/auth/config errors need a person, not a retry loop.
            },
        )
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

package art.querencia.track.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Collects closed usage intervals offline; synchronizes with a separate token. */
class PulseWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = mutex.withLock {
        withContext(Dispatchers.IO) {
            val store = PulseStore(applicationContext)
            val config = store.config() ?: return@withContext Result.success()
            if (!UsageAccess.granted(applicationContext)) {
                store.notice(config.generation, "Usage access revoked; no collection or sync.")
                return@withContext Result.success()
            }
            try {
                val now = System.currentTimeMillis()
                val previous = store.queue(config.generation) ?: return@withContext Result.success()
                if (now < previous.checkpoint) {
                    store.notice(config.generation, "Device clock moved backwards; waiting for a valid time.")
                    return@withContext Result.retry()
                }
                val since = maxOf(config.since, now - 86_400_000L)
                val marks = UsageAccess.query(applicationContext, since, now)
                val fresh = usageIntervals(marks, since, now).filter { it.endMs > previous.checkpoint }
                val recent = (previous.events + fresh).filter { it.startMs >= now - 30L * 86_400_000L }
                val expired = previous.events.count { it.startMs < now - 30L * 86_400_000L }
                if (!store.save(config.generation, now, recent, previous.dropped + expired)) return@withContext Result.success()
                repeat(20) {
                    if (isStopped || !UsageAccess.granted(applicationContext)) return@withContext Result.success()
                    val queue = store.queue(config.generation) ?: return@withContext Result.success()
                    val batch = queue.events.take(200)
                    if (batch.isEmpty()) {
                        store.notice(config.generation, "Pulse synced.")
                        return@withContext Result.success()
                    }
                    val body = JSONArray()
                    batch.forEach { e ->
                        body.put(JSONObject().put("eventId", e.eventId).put("source", "android")
                            .put("startMs", e.startMs).put("endMs", e.endMs))
                    }
                    if (store.config()?.generation != config.generation) return@withContext Result.success()
                    val response = JSONObject(TrackApi.post(config.server, "/api/integrations/activity", config.token, body.toString()))
                    val ack = response.optJSONArray("ack") ?: error("Missing acknowledgment")
                    val acknowledged = (0 until ack.length()).map { ack.getString(it) }.toSet()
                    require(response.optBoolean("ok") && acknowledged == batch.map { it.eventId }.toSet()) { "Invalid acknowledgment" }
                    if (!store.save(config.generation, queue.checkpoint, queue.events.filterNot { it.eventId in acknowledged }, queue.dropped))
                        return@withContext Result.success()
                }
                store.notice(config.generation, "Pulse queued; remaining intervals will sync later.")
                Result.success()
            } catch (_: Exception) {
                store.notice(config.generation, "Pulse unavailable; pending intervals retained.")
                Result.retry()
            }
        }
    }

    companion object {
        private val mutex = Mutex()
        private const val PERIODIC = "track-pulse-periodic"
        private const val IMMEDIATE = "track-pulse-now"
        fun schedule(context: Context) {
            // No network constraint: collection can be recorded while offline.
            val request = PeriodicWorkRequestBuilder<PulseWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
        }
        fun syncNow(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(IMMEDIATE, ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<PulseWorker>().build())
        }
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
            WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE)
        }
    }
}

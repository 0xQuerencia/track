package art.querencia.track

import android.app.Application
import android.os.SystemClock
import art.querencia.track.data.LocalFocus
import art.querencia.track.data.SyncReport
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import uniffi.track_core.CoreException
import uniffi.track_core.Engine
import uniffi.track_core.TaskItem
import uniffi.track_core.TodayView

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as TrackApp

    private val _today = MutableStateFlow<TodayView?>(null)
    val today: StateFlow<TodayView?> = _today

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message

    val syncState = app.sync.state
    private var syncJob: Job? = null

    private val _localFocus = MutableStateFlow<LocalFocus?>(null)
    internal val localFocus: StateFlow<LocalFocus?> = _localFocus

    fun startLocalFocus(minutes: Int) {
        if (minutes !in listOf(25, 50)) return
        val chapter = _today.value?.studyChapter
        val label = chapter?.let { (it.subject + ": " + it.name).take(120) } ?: "Phone focus timer"
        _localFocus.compareAndSet(null, LocalFocus(
            LocalDate.now().toString(), label, minutes, SystemClock.elapsedRealtime(),
        ))
    }

    fun saveLocalFocus() {
        val run = _localFocus.value ?: return
        if (run.saving) return
        val minutes = run.completedMinutes(SystemClock.elapsedRealtime())
        if (minutes == 0u || !_localFocus.compareAndSet(run, run.copy(saving = true))) return
        viewModelScope.launch(Dispatchers.Default) {
            runCatching { app.engine.logFocus(run.date, run.label, minutes, 0u) }
                .onSuccess {
                    _localFocus.value = null
                    _message.value = "Saved locally. It will sync when connected."
                    refresh()
                    syncSoon()
                }
                .onFailure {
                    _localFocus.value = run
                    _message.value = "Couldn't save that focus session. Try again."
                }
        }
    }

    fun discardLocalFocus() {
        val run = _localFocus.value ?: return
        if (!run.saving) _localFocus.compareAndSet(run, null)
    }

    init {
        refresh()
        viewModelScope.launch { app.sync.version.collect { refresh() } }
        syncSoon(0)
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.Default) {
            _today.value = runCatching {
                app.engine.today(LocalDate.now().toString(), LocalTime.now().hour.toUInt())
            }.getOrNull()
        }
    }

    /** Runs a change against the engine, then reloads the view and syncs shortly after. */
    fun change(block: (Engine, String) -> Unit) {
        viewModelScope.launch(Dispatchers.Default) {
            runCatching { block(app.engine, LocalDate.now().toString()) }.onFailure {
                _message.value = if (it is CoreException.Invalid) it.message else "Couldn't save that."
            }
            refresh()
            syncSoon()
        }
    }

    fun syncSoon(delayMs: Long = 1500) {
        syncJob?.cancel()
        syncJob = viewModelScope.launch {
            delay(delayMs)
            app.sync.sync()
        }
    }

    /** Immediate sync that reports the outcome, for the Settings button. */
    suspend fun pairAndSync(server: String, token: String): Result<SyncReport> = app.sync.pairAndSync(server, token)

    suspend fun searchTasks(query: String): List<TaskItem> = kotlinx.coroutines.withContext(Dispatchers.Default) {
        if (query.length < 2) emptyList()
        else runCatching { app.engine.tasks(LocalDate.now().toString(), false) }
            .getOrDefault(emptyList())
            .filter { it.title.contains(query, ignoreCase = true) }
            .take(4)
    }

    fun clearMessage() {
        _message.value = null
    }
}

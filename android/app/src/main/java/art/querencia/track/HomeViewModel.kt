package art.querencia.track

import android.app.Application
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
import uniffi.track_core.Insights
import uniffi.track_core.TaskItem
import uniffi.track_core.TodayView

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as TrackApp

    private val _today = MutableStateFlow<TodayView?>(null)
    val today: StateFlow<TodayView?> = _today

    private val _insights = MutableStateFlow<Insights?>(null)
    val insights: StateFlow<Insights?> = _insights

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message

    val syncState = app.sync.state
    private var syncJob: Job? = null

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
            _insights.value = runCatching { app.engine.insights() }.getOrNull()
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
    suspend fun syncNow(): Result<Unit> = app.sync.sync()

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

package art.querencia.track.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import android.os.SystemClock
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import art.querencia.track.data.LocalFocus
import art.querencia.track.data.SyncState
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import uniffi.track_core.ChapterItem
import uniffi.track_core.ExamItem
import uniffi.track_core.HabitItem
import uniffi.track_core.TaskItem
import uniffi.track_core.TodayView

@Composable
internal fun HomeScreen(
    today: TodayView?,
    syncState: SyncState,
    localFocus: LocalFocus?,
    onStartFocus: (Int) -> Unit,
    onSaveFocus: () -> Unit,
    onDiscardFocus: () -> Unit,
    contentPadding: PaddingValues,
    onSettings: () -> Unit,
    onToggleTask: (TaskItem) -> Unit,
    onAddTask: (String) -> Unit,
    onToggleHabit: (HabitItem) -> Unit,
    footer: @Composable () -> Unit = {},
) {
    LazyColumn(
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(horizontal = 16.dp),
    ) {
        item { Header(today, syncState, onSettings) }
        if (today == null) return@LazyColumn
        today.nextExam?.let { exam -> item { Reveal(1) { ExamCard(exam) } } }
        item { Reveal(2) { PrioritiesCard(today, onToggleTask, onAddTask) } }
        if (today.habits.isNotEmpty()) item { Reveal(3) { HabitsCard(today, onToggleHabit) } }
        item { Reveal(4) { StudyCard(today.studyChapter, today.focusMinutes.toInt()) } }
        item(key = "phone-focus") { FocusTimerCard(localFocus, onStartFocus, onSaveFocus, onDiscardFocus) }
        item { Reveal(5) { footer() } }
    }
}

/** Fades and lifts each card in with a small stagger, like the web dashboard. */
@Composable
private fun Reveal(index: Int, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(index * 70L)
        visible = true
    }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(320)) + slideInVertically(tween(380)) { it / 10 },
    ) { content() }
}

@Composable
private fun Header(today: TodayView?, sync: SyncState, onSettings: () -> Unit) {
    Column(Modifier.padding(top = 8.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(today?.dateLabel?.uppercase() ?: "", TrackType.Label, Modifier.weight(1f))
            Box(Modifier.semantics { contentDescription = "Open Track settings" }.pressable(onClick = onSettings).padding(12.dp)) { SlidersIcon(TrackColors.MutedForeground) }
        }
        val name = today?.name?.let { ", $it" }.orEmpty()
        Text("${today?.greeting ?: "Hello"}$name", TrackType.Display)
        today?.let { SyncLine(it, sync) }
    }
}

@Composable
private fun SyncLine(today: TodayView, sync: SyncState) {
    val (text, color) = when {
        sync is SyncState.Failed -> sync.message to TrackColors.Destructive
        sync is SyncState.Waiting -> sync.report.message to TrackColors.MutedForeground
        sync is SyncState.Running -> "Syncing…" to TrackColors.MutedForeground
        today.lastSync == null -> "Not synced yet" to TrackColors.MutedForeground
        else -> {
            val ago = runCatching { Duration.between(Instant.parse(today.lastSync), Instant.now()).toMinutes() }.getOrDefault(0)
            val rel = when {
                ago < 1 -> "just now"
                ago < 60 -> "${ago}m ago"
                ago < 1440 -> "${ago / 60}h ago"
                else -> "${ago / 1440}d ago"
            }
            val pending = if (today.pendingOps > 0u) " · ${today.pendingOps} waiting to sync" else ""
            "Synced $rel$pending" to TrackColors.MutedForeground
        }
    }
    Text(text, TrackType.Small.copy(color = color))
}

@Composable
private fun ExamCard(exam: ExamItem) {
    val days by animateIntAsState(exam.daysLeft.toInt().coerceAtLeast(0), tween(900), label = "days")
    TrackCard {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("$days", TrackType.Number.copy(color = if (exam.daysLeft <= 7) TrackColors.Chart3 else TrackColors.Foreground))
            Column(Modifier.padding(bottom = 6.dp)) {
                Text(if (exam.daysLeft == 1L) "DAY TO GO" else "DAYS TO GO", TrackType.Label)
                Text(exam.name, TrackType.Title, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        exam.targetPct?.let { Text("Target ${it.toInt()}% · ${formatDate(exam.date)}", TrackType.Small) }
    }
}

@Composable
private fun PrioritiesCard(today: TodayView, onToggle: (TaskItem) -> Unit, onAdd: (String) -> Unit) {
    TrackCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("PRIORITIES", TrackType.Label, Modifier.weight(1f))
            val summary = buildList {
                if (today.overdueTasks > 0u) add("${today.overdueTasks} overdue")
                if (today.dueToday > 0u) add("${today.dueToday} due today")
                if (isEmpty()) add("${today.openTasks} open")
            }.joinToString(" · ")
            Text(summary, TrackType.Small.copy(color = if (today.overdueTasks > 0u) TrackColors.Destructive else TrackColors.MutedForeground))
        }
        if (today.topTasks.isEmpty()) Text("Nothing pending. Add something below.", TrackType.Small)
        today.topTasks.forEach { task -> TaskRow(task, onToggle) }
        AddTaskField(onAdd)
    }
}

@Composable
private fun TaskRow(task: TaskItem, onToggle: (TaskItem) -> Unit) {
    var done by remember(task.id) { mutableStateOf(false) }
    val fill by animateFloatAsState(if (done) 1f else 0f, tween(220), label = "tick")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier
                .pressable { done = true; onToggle(task) }
                .size(24.dp)
                .clip(CircleShape)
                .background(TrackColors.Ring.copy(alpha = fill))
                .border(1.5.dp, if (done) TrackColors.Ring else TrackColors.Input, CircleShape),
            contentAlignment = Alignment.Center,
        ) { if (done) CheckIcon(TrackColors.PrimaryForeground, 14.dp) }
        Column(Modifier.weight(1f)) {
            Text(
                task.title,
                TrackType.BodyMedium.copy(textDecoration = if (done) TextDecoration.LineThrough else null),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(taskMeta(task), TrackType.Small.copy(color = if (task.overdue) TrackColors.Destructive else TrackColors.MutedForeground))
        }
        Box(Modifier.size(8.dp).clip(CircleShape).background(priorityColor(task.priority)))
    }
}

@Composable
private fun AddTaskField(onAdd: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    val submit = { if (text.isNotBlank()) { onAdd(text); text = "" } }
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TrackShapes.Radius))
            .background(TrackColors.Muted)
            .border(1.dp, TrackColors.Border, RoundedCornerShape(TrackShapes.Radius))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        if (text.isEmpty()) Text("Add a task", TrackType.Small)
        BasicTextField(
            value = text,
            onValueChange = { text = it.take(200) },
            singleLine = true,
            textStyle = TrackType.Body,
            cursorBrush = SolidColor(TrackColors.Ring),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun HabitsCard(today: TodayView, onToggle: (HabitItem) -> Unit) {
    TrackCard {
        Row {
            Text("HABITS", TrackType.Label, Modifier.weight(1f))
            Text("${today.habitsDone}/${today.habits.size} today", TrackType.Small)
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(today.habits, key = { it.id }) { habit ->
                val bg by animateFloatAsState(if (habit.doneToday) 1f else 0f, tween(200), label = "habit")
                Row(
                    Modifier
                        .pressable { onToggle(habit) }
                        .clip(RoundedCornerShape(TrackShapes.Radius))
                        .background(androidx.compose.ui.graphics.lerp(TrackColors.Muted, TrackColors.Ring, bg))
                        .border(1.dp, TrackColors.Border, RoundedCornerShape(TrackShapes.Radius))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val ink = if (habit.doneToday) TrackColors.PrimaryForeground else TrackColors.Foreground
                    Text(habit.name, TrackType.BodyMedium.copy(color = ink))
                    if (habit.streak > 0u) Text("${habit.streak}d", TrackType.Label.copy(color = ink.copy(alpha = 0.7f)))
                }
            }
        }
    }
}

@Composable
private fun StudyCard(chapter: ChapterItem?, focusMinutes: Int) {
    TrackCard {
        Row {
            Text("STUDY", TrackType.Label, Modifier.weight(1f))
            Text("$focusMinutes min focus today", TrackType.Small)
        }
        if (chapter == null) {
            Text("No next chapter in the local cache.", TrackType.Small)
        } else {
            Text("${chapter.subject.uppercase()} · UP NEXT", TrackType.Label.copy(color = TrackColors.Ring))
            Text(chapter.name, TrackType.Title)
            val mastery by animateFloatAsState((chapter.mastery / 100.0).toFloat().coerceIn(0f, 1f), tween(700), label = "mastery")
            Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(TrackColors.Secondary)) {
                Box(Modifier.fillMaxWidth(mastery).height(4.dp).background(TrackColors.Ring))
            }
            Text("Mastery ${chapter.mastery.toInt()}%", TrackType.Small)
        }
    }
}

@Composable
private fun FocusTimerCard(
    run: LocalFocus?,
    onStart: (Int) -> Unit,
    onSave: () -> Unit,
    onDiscard: () -> Unit,
) {
    var now by remember(run) { mutableStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(run) {
        if (run != null) {
            while (run.remainingSeconds(now) > 0L) {
                delay(500)
                now = SystemClock.elapsedRealtime()
            }
        }
    }
    TrackCard {
        Text("PHONE FOCUS TIMER", TrackType.Label)
        if (run == null) {
            Text("Self-timed. No app-use or screen monitoring.", TrackType.Small)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button("Start 25 min", primary = true) { onStart(25) }
                Button("Start 50 min") { onStart(50) }
            }
        } else {
            val remaining = run.remainingSeconds(now)
            val minutes = run.completedMinutes(now)
            val clock = (remaining / 60L).toString().padStart(2, '0') + ":" +
                (remaining % 60L).toString().padStart(2, '0')
            Text(run.label, TrackType.BodyMedium)
            Text(if (remaining == 0L) "Timer complete" else clock, TrackType.Title)
            if (run.saving) {
                Text("Saving locally…", TrackType.Small)
            } else {
                if (minutes == 0u) Text("Log at least one whole minute.", TrackType.Small)
                else Button("Save $minutes min", primary = true, onClick = onSave)
                Button("Discard timer", onClick = onDiscard)
            }
        }
    }
}

private fun priorityColor(priority: String): Color = when (priority) {
    "High" -> TrackColors.Destructive
    "Medium" -> TrackColors.Chart3
    else -> TrackColors.Input
}

private val shortDate = DateTimeFormatter.ofPattern("MMM d")

fun formatDate(iso: String): String = runCatching { LocalDate.parse(iso).format(shortDate) }.getOrDefault(iso)

private fun taskMeta(task: TaskItem): String {
    val due = task.due?.let { d ->
        val date = runCatching { LocalDate.parse(d) }.getOrNull()
        val today = LocalDate.now()
        when {
            date == null -> d
            date.isBefore(today) -> "Overdue · ${formatDate(d)}"
            date == today -> "Today"
            date == today.plusDays(1) -> "Tomorrow"
            else -> formatDate(d)
        }
    }
    val sync = if (task.unsynced) "not synced" else null
    return listOfNotNull(task.priority, due, sync).joinToString(" · ")
}

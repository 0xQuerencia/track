package art.querencia.track.ui

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntOffset
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.roundToInt
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import art.querencia.track.data.AppEntry
import art.querencia.track.data.AppsRepo
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay
import uniffi.track_core.TodayView

private val dateFormat = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.getDefault())

private val LETTERS: List<Char> = listOf('★', '#') + ('A'..'Z')

private fun letterOf(label: String): Char =
    label.firstOrNull()?.uppercaseChar()?.takeIf { it in 'A'..'Z' } ?: '#'

/**
 * The home page: wallpaper, a large clock, one quiet Track line and your
 * favourites. Touch the right edge and the alphabet bends toward your finger;
 * slide to a letter to list its apps. Swipe up for search, left for the dashboard.
 */
@Composable
fun NiagaraHome(
    favorites: List<AppEntry>,
    allApps: List<AppEntry>,
    repo: AppsRepo,
    today: TodayView?,
    resetSignal: Int,
    onLaunch: (AppEntry) -> Unit,
    onAppMenu: (AppEntry) -> Unit,
    onOpenDrawer: () -> Unit,
    onOpenDashboard: () -> Unit,
    onSettings: () -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val now by produceState(LocalTime.now()) {
        while (true) {
            value = LocalTime.now()
            delay(10_000)
        }
    }
    val clock = now.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))

    var dragged by remember { mutableStateOf(0f) }
    var touch by remember { mutableStateOf<Offset?>(null) }
    var active by remember { mutableStateOf('★') }
    // The letter whose apps stay listed after the finger lifts; null shows favourites.
    var shown by remember { mutableStateOf<Char?>(null) }
    LaunchedEffect(resetSignal) { shown = null }

    val letterApps = remember(allApps, shown, active, touch) {
        val c = if (touch != null) active else shown
        when (c) {
            null, '★' -> null
            else -> c to allApps.filter { letterOf(it.label) == c }
        }
    }
    val wave by animateFloatAsState(if (touch != null) 1f else 0f, tween(180), label = "wave")

    Box(
        Modifier
            .fillMaxSize()
            // A soft scrim keeps text legible on any wallpaper.
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f))))
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { dragged = 0f },
                    onVerticalDrag = { _, dy ->
                        dragged += dy
                        if (dragged < -90f) { dragged = 0f; onOpenDrawer() }
                    },
                )
            }
            // Declared after the swipe-up detector so it sees touches first.
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (down.position.x < size.width * 0.74f) return@awaitEachGesture
                    val top = size.height * 0.2f
                    val bottom = size.height * 0.9f
                    fun pick(y: Float) {
                        val i = ((y - top) / (bottom - top) * LETTERS.size).toInt().coerceIn(0, LETTERS.lastIndex)
                        if (LETTERS[i] != active) {
                            active = LETTERS[i]
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        }
                    }
                    down.consume()
                    touch = down.position
                    pick(down.position.y)
                    while (true) {
                        val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        change.consume()
                        touch = change.position
                        pick(change.position.y)
                    }
                    shown = active.takeIf { it != '★' }
                    touch = null
                }
            },
    ) {
        Column(
            Modifier.align(Alignment.BottomStart).statusBarsPadding().navigationBarsPadding().padding(start = 32.dp, end = 24.dp, bottom = 28.dp),
        ) {
            Text(
                clock,
                TrackType.Display.copy(fontSize = 92.sp, lineHeight = 96.sp, fontWeight = FontWeight.Normal, fontFamily = Sans, letterSpacing = (-2).sp),
                Modifier.pressable(scale = 0.99f, onLongClick = onSettings) { onOpenDashboard() },
            )
            Text(LocalDate.now().format(dateFormat), TrackType.Title.copy(fontSize = 20.sp, fontWeight = FontWeight.Medium), Modifier.padding(start = 4.dp))
            today?.let { TrackLine(it, onOpenDashboard) }

            Column(Modifier.padding(top = 26.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                val list = letterApps?.second ?: favorites
                letterApps?.let { (c, apps) ->
                    Text(c.toString(), TrackType.Display.copy(fontSize = 40.sp), Modifier.padding(start = 2.dp, bottom = 2.dp))
                    if (apps.isEmpty()) Text("No apps", TrackType.Body.copy(color = Color.White.copy(alpha = 0.6f)))
                }
                list.take(7).forEach { app ->
                    key(app.packageName) {
                        Row(
                            Modifier
                                .fillMaxWidth(0.72f)
                                .pressable(onLongClick = { onAppMenu(app) }, scale = 0.97f) { onLaunch(app) }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(22.dp),
                        ) {
                            AppIcon(repo, app.packageName, 50.dp)
                            Text(app.label, TrackType.Title.copy(fontSize = 26.sp, fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }

        // The alphabet: a column at the right edge that bows toward the finger.
        if (wave > 0.01f) {
            val finger = touch
            BoxWithConstraints(Modifier.fillMaxSize().alpha(wave)) {
                val w = constraints.maxWidth.toFloat()
                val h = constraints.maxHeight.toFloat()
                val top = h * 0.2f
                val step = (h * 0.9f - top) / LETTERS.size
                val restX = w - with(density) { 34.dp.toPx() }
                val sigma = with(density) { 150.dp.toPx() }
                val gap = with(density) { 110.dp.toPx() }
                val box = with(density) { 36.dp.toPx() }
                LETTERS.forEachIndexed { i, c ->
                    val y = top + step * (i + 0.5f)
                    // Letters near the finger are pulled toward it; others rest at the edge.
                    val pull = finger?.let { f ->
                        val d = (y - f.y) / sigma
                        min(0f, f.x + gap - restX) * exp(-d * d)
                    } ?: 0f
                    val x = restX + pull
                    val isActive = c == active
                    Text(
                        c.toString(),
                        TrackType.Title.copy(fontSize = if (isActive) 30.sp else 20.sp, fontWeight = FontWeight.SemiBold, color = if (isActive) TrackColors.Ring else Color.White),
                        Modifier.offset { IntOffset((x - box / 2).roundToInt(), (y - box / 2).roundToInt()) }.size(36.dp),
                    )
                }
                finger?.let { f ->
                    val activeY = top + step * (LETTERS.indexOf(active) + 0.5f)
                    val r = with(density) { 32.dp.toPx() }
                    Box(
                        Modifier
                            .offset { IntOffset((f.x - r).roundToInt(), (activeY - r).roundToInt()) }
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.82f)),
                        contentAlignment = Alignment.Center,
                    ) { Text(active.toString(), TrackType.Display.copy(color = Color.Black.copy(alpha = 0.75f))) }
                }
            }
        }
    }
}

/** The one line of Track on the home page: what's coming and what's open. */
@Composable
private fun TrackLine(today: TodayView, onClick: () -> Unit) {
    val exam = today.nextExam?.let { "${it.daysLeft} ${if (it.daysLeft == 1L) "day" else "days"} to ${it.name}" }
    val tasks = if (today.openTasks > 0u) "${today.openTasks} open" else null
    val line = listOfNotNull(exam, tasks).joinToString("  ·  ")
    if (line.isNotEmpty()) {
        Text(
            line,
            TrackType.Body.copy(color = Color.White.copy(alpha = 0.72f)),
            Modifier.padding(start = 4.dp, top = 10.dp).pressable(onClick = onClick),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

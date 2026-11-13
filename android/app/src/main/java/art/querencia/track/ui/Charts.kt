package art.querencia.track.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import uniffi.track_core.DayPoint
import uniffi.track_core.LabelPoint

/*
 * Native ports of the web dashboard's Bklit-style charts: sage-led palette,
 * a faint horizontal grid, a gradient under a smooth line, rounded bars and a
 * donut with a centred figure. No chart library: each is one Canvas.
 */

val ChartPalette = listOf(
    Color(0xFFA9CBB3), Color(0xFFA9B8CA), Color(0xFFD5B890),
    Color(0xFFB6A5C6), Color(0xFFC3C7AA), Color(0xFFD29A94),
)

private val dayLabel = DateTimeFormatter.ofPattern("MMM d")

private fun shortDay(iso: String) = runCatching { LocalDate.parse(iso).format(dayLabel) }.getOrDefault(iso)

/** Rounds a maximum up to a tidy axis top so gridlines land on clean numbers. */
private fun niceMax(max: Double): Double {
    if (max <= 0) return 1.0
    val pow = Math.pow(10.0, Math.floor(Math.log10(max)))
    val n = max / pow
    return pow * when { n <= 1 -> 1.0; n <= 2 -> 2.0; n <= 5 -> 5.0; else -> 10.0 }
}

@Composable
private fun rememberReveal(key: Any, ms: Int = 900): Float {
    var go by remember(key) { mutableStateOf(false) }
    LaunchedEffect(key) { go = true }
    val p by animateFloatAsState(if (go) 1f else 0f, tween(ms, easing = FastOutSlowInEasing), label = "reveal")
    return p
}

@Composable
private fun Empty(note: String, height: androidx.compose.ui.unit.Dp) {
    Box(Modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
        Text(note, TrackType.Small)
    }
}

@Composable
fun TrendChart(points: List<DayPoint>, modifier: Modifier = Modifier, color: Color = ChartPalette[0], unit: String = "min") {
    if (points.size < 2 || points.all { it.value == 0.0 }) {
        Empty("Nothing logged in this period yet.", 120.dp)
        return
    }
    val reveal = rememberReveal(points)
    val top = niceMax(points.maxOf { it.value })
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.fillMaxWidth().height(130.dp)) {
            val w = size.width
            val h = size.height
            // Horizontal grid at 0, 1/2 and top.
            listOf(0f, 0.5f, 1f).forEach { f ->
                val y = h - h * f
                drawLine(TrackColors.Border.copy(alpha = 0.7f), Offset(0f, y), Offset(w, y), 1.dp.toPx())
            }
            val stepX = w / (points.size - 1)
            val xs = points.indices.map { it * stepX }
            val ys = points.map { (h - (it.value / top).toFloat() * h * 0.94f) }
            val line = Path().apply {
                moveTo(xs[0], ys[0])
                for (i in 1 until points.size) {
                    val mx = (xs[i - 1] + xs[i]) / 2f
                    cubicTo(mx, ys[i - 1], mx, ys[i], xs[i], ys[i])
                }
            }
            val area = Path().apply {
                addPath(line)
                lineTo(xs.last(), h)
                lineTo(xs.first(), h)
                close()
            }
            clipRect(right = w * reveal) {
                drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.30f), color.copy(alpha = 0f))))
                drawPath(line, color, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            if (reveal > 0.98f) {
                drawCircle(TrackColors.Background, 5.dp.toPx(), Offset(xs.last(), ys.last()))
                drawCircle(color, 3.5.dp.toPx(), Offset(xs.last(), ys.last()))
            }
        }
        Row {
            Text(shortDay(points.first().date).uppercase(), TrackType.Label, Modifier.weight(1f))
            Text("${top.toInt()} ${unit.uppercase()} MAX", TrackType.Label)
        }
    }
}

@Composable
fun BarsChart(points: List<DayPoint>, modifier: Modifier = Modifier, color: Color = ChartPalette[1]) {
    if (points.isEmpty() || points.all { it.value == 0.0 }) {
        Empty("Nothing logged in this period yet.", 110.dp)
        return
    }
    val reveal = rememberReveal(points, 700)
    val top = niceMax(points.maxOf { it.value })
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.fillMaxWidth().height(110.dp)) {
            val gap = 5.dp.toPx()
            val bar = (size.width - gap * (points.size - 1)) / points.size
            drawLine(TrackColors.Border, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
            points.forEachIndexed { i, p ->
                val h = (p.value / top).toFloat() * (size.height - 2.dp.toPx()) * reveal
                if (h <= 0f) return@forEachIndexed
                drawRoundRect(
                    color = if (i == points.lastIndex) color else color.copy(alpha = 0.5f),
                    topLeft = Offset(i * (bar + gap), size.height - h),
                    size = Size(bar, h),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
        Row {
            Text(shortDay(points.first().date).uppercase(), TrackType.Label, Modifier.weight(1f))
            Text("TODAY", TrackType.Label)
        }
    }
}

@Composable
fun Donut(items: List<LabelPoint>, modifier: Modifier = Modifier) {
    val data = items.filter { it.value > 0 }
    if (data.isEmpty()) {
        Empty("Log some mastery to see the split.", 120.dp)
        return
    }
    val reveal = rememberReveal(data, 1000)
    val total = data.sumOf { it.value }
    val average = items.map { it.value }.average().let { if (it.isNaN()) 0 else Math.round(it).toInt() }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(120.dp)) {
                val stroke = 14.dp.toPx()
                val inset = stroke / 2
                var start = -90f
                data.forEachIndexed { i, d ->
                    val sweep = (d.value / total * 360.0).toFloat()
                    val gap = if (data.size > 1) 3f else 0f
                    drawArc(
                        color = ChartPalette[i % ChartPalette.size],
                        startAngle = start + gap / 2,
                        sweepAngle = ((sweep - gap) * reveal).coerceAtLeast(0f),
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = Size(size.width - stroke, size.height - stroke),
                        style = Stroke(stroke, cap = StrokeCap.Butt),
                    )
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$average%", TrackType.Title.copy(fontFamily = Wordmark))
                Text("AVG", TrackType.Label)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.weight(1f)) {
            data.forEachIndexed { i, d ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(8.dp).background(ChartPalette[i % ChartPalette.size], CircleShape))
                    Text(d.label, TrackType.Small.copy(color = TrackColors.Foreground), Modifier.weight(1f), maxLines = 1)
                    Text("${d.value.toInt()}%", TrackType.Label)
                }
            }
        }
    }
}

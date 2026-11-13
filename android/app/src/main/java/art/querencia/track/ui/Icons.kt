package art.querencia.track.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Tiny hand-drawn icons: no icon library in the APK. */
@Composable
fun CheckIcon(color: Color, size: Dp = 14.dp) = Canvas(Modifier.size(size)) {
    val w = this.size.width
    val stroke = Stroke(width = w * 0.14f, cap = StrokeCap.Round)
    drawLine(color, Offset(w * 0.18f, w * 0.54f), Offset(w * 0.42f, w * 0.76f), stroke.width, StrokeCap.Round)
    drawLine(color, Offset(w * 0.42f, w * 0.76f), Offset(w * 0.84f, w * 0.26f), stroke.width, StrokeCap.Round)
}

@Composable
fun GridIcon(color: Color, size: Dp = 22.dp) = Canvas(Modifier.size(size)) {
    val w = this.size.width
    for (r in 0..2) for (c in 0..2)
        drawCircle(color, radius = w * 0.075f, center = Offset(w * (0.2f + c * 0.3f), w * (0.2f + r * 0.3f)))
}

@Composable
fun SlidersIcon(color: Color, size: Dp = 20.dp) = Canvas(Modifier.size(size)) {
    val w = this.size.width
    val sw = w * 0.09f
    drawLine(color, Offset(w * 0.12f, w * 0.32f), Offset(w * 0.88f, w * 0.32f), sw, StrokeCap.Round)
    drawLine(color, Offset(w * 0.12f, w * 0.68f), Offset(w * 0.88f, w * 0.68f), sw, StrokeCap.Round)
    drawCircle(color, w * 0.13f, Offset(w * 0.64f, w * 0.32f))
    drawCircle(color, w * 0.13f, Offset(w * 0.36f, w * 0.68f))
}

@Composable
fun SearchIcon(color: Color, size: Dp = 18.dp) = Canvas(Modifier.size(size)) {
    val w = this.size.width
    drawCircle(color, w * 0.28f, Offset(w * 0.43f, w * 0.43f), style = Stroke(w * 0.1f))
    drawLine(color, Offset(w * 0.64f, w * 0.64f), Offset(w * 0.86f, w * 0.86f), w * 0.1f, StrokeCap.Round)
}

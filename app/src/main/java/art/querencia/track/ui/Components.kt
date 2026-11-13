package art.querencia.track.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Clickable with a quick press-scale instead of a ripple, matching Track's tactile buttons. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Modifier.pressable(
    onLongClick: (() -> Unit)? = null,
    scale: Float = 0.96f,
    onClick: () -> Unit,
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val s by animateFloatAsState(
        targetValue = if (pressed) scale else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    return this
        .graphicsLayer { scaleX = s; scaleY = s }
        .combinedClickable(interactionSource = source, indication = null, onLongClick = onLongClick, onClick = onClick)
}

/** A bordered surface on the card color: Track's basic container. */
@Composable
fun TrackCard(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(TrackShapes.Radius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(TrackColors.Card)
            .border(BorderStroke(1.dp, TrackColors.Border), shape)
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

@Composable
fun Text(
    text: String,
    style: androidx.compose.ui.text.TextStyle,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    overflow: androidx.compose.ui.text.style.TextOverflow = androidx.compose.ui.text.style.TextOverflow.Clip,
) = androidx.compose.foundation.text.BasicText(text, modifier, style, maxLines = maxLines, overflow = overflow)

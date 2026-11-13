package art.querencia.track.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import art.querencia.track.R

/** Track's dark palette, ported 1:1 from the web app's CSS variables. */
object TrackColors {
    val Background = Color(0xFF111315)
    val Foreground = Color(0xFFE7E8E7)
    val Card = Color(0xFF171A1C)
    val Popover = Color(0xFF1B1E20)
    val Primary = Color(0xFFE4E7E4)
    val PrimaryForeground = Color(0xFF151719)
    val Secondary = Color(0xFF25292C)
    val Muted = Color(0xFF1C2022)
    val MutedForeground = Color(0xFF959C9E)
    val Accent = Color(0xFF282E30)
    val Destructive = Color(0xFFEF8981)
    val Border = Color(0xFF2C3134)
    val Input = Color(0xFF303638)
    val Ring = Color(0xFFAAC7B5)
    val Chart1 = Color(0xFFAAC7B5)
    val Chart2 = Color(0xFFA9B8CA)
    val Chart3 = Color(0xFFD5B890)
    val Chart4 = Color(0xFFB6A5C6)
}

object TrackShapes {
    /** The web app's --radius: 0.25rem. */
    val Radius = 4.dp
}

private fun family(res: Int, vararg weights: Int) = FontFamily(
    weights.map { w ->
        Font(res, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    },
)

val Wordmark = family(R.font.bricolage_grotesque, 500, 600, 700)
val Sans = family(R.font.schibsted_grotesk, 400, 500, 600, 700)
val Mono = family(R.font.spline_sans_mono, 400, 500)

object TrackType {
    val Display = TextStyle(fontFamily = Wordmark, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 34.sp, color = TrackColors.Foreground)
    val Title = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp, color = TrackColors.Foreground)
    val Body = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp, color = TrackColors.Foreground)
    val BodyMedium = Body.copy(fontWeight = FontWeight.Medium)
    val Small = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 17.sp, color = TrackColors.MutedForeground)
    val Label = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.8.sp, color = TrackColors.MutedForeground)
    val Number = TextStyle(fontFamily = Wordmark, fontWeight = FontWeight.Bold, fontSize = 44.sp, lineHeight = 46.sp, color = TrackColors.Foreground)
}

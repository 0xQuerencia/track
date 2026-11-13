package art.querencia.track.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import art.querencia.track.data.AppEntry
import art.querencia.track.data.Prefs
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    prefs: Prefs,
    hiddenApps: List<AppEntry>,
    contentPadding: PaddingValues,
    onSyncNow: suspend () -> Result<Unit>,
    onUnhide: (AppEntry) -> Unit,
    mono: Boolean,
    onMono: (Boolean) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(prefs.serverUrl) }
    var token by remember { mutableStateOf(prefs.token.orEmpty()) }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().background(TrackColors.Background),
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Settings", TrackType.Display, Modifier.weight(1f))
                Text("Done", TrackType.BodyMedium.copy(color = TrackColors.Ring), Modifier.pressable(onClick = onClose).padding(8.dp))
            }
        }
        item {
            TrackCard {
                Text("TRACK SERVER", TrackType.Label)
                Field("Address", server, { server = it }, "https://your-track-server")
                Field("API token", token, { token = it }, "Paste your token", secret = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(if (busy) "Syncing…" else "Save and sync", primary = true) {
                        if (busy) return@Button
                        prefs.serverUrl = server
                        prefs.token = token
                        busy = true
                        status = null
                        scope.launch {
                            val r = onSyncNow()
                            busy = false
                            status = r.fold({ "Connected. Data synced." }, { it.message ?: "Sync failed." })
                        }
                    }
                }
                status?.let { Text(it, TrackType.Small.copy(color = if (it.startsWith("Connected")) TrackColors.Ring else TrackColors.Destructive)) }
            }
        }
        item {
            TrackCard {
                Text("ICONS", TrackType.Label)
                Text("Line icons use each app's themed icon in white. Apps without one get an outlined tile.", TrackType.Small)
                Button(if (mono) "Style: Line (tap for Color)" else "Style: Color (tap for Line)") { onMono(!mono) }
            }
        }
        item {
            TrackCard {
                Text("HOME APP", TrackType.Label)
                Text("Make Track your home screen so the Home button brings you here.", TrackType.Small)
                Button("Choose default home app") { openHomeSettings(context) }
            }
        }
        item {
            TrackCard {
                Text("HIDDEN APPS", TrackType.Label)
                if (hiddenApps.isEmpty()) Text("None. Long-press an app in the drawer to hide it.", TrackType.Small)
                hiddenApps.forEach { app ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(app.label, TrackType.Body, Modifier.weight(1f))
                        Text("Unhide", TrackType.BodyMedium.copy(color = TrackColors.Ring), Modifier.pressable { onUnhide(app) }.padding(8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit, hint: String, secret: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, TrackType.Small)
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(TrackShapes.Radius))
                .background(TrackColors.Muted)
                .border(1.dp, TrackColors.Border, RoundedCornerShape(TrackShapes.Radius))
                .padding(horizontal = 12.dp, vertical = 11.dp),
        ) {
            if (value.isEmpty()) Text(hint, TrackType.Body.copy(color = TrackColors.MutedForeground))
            BasicTextField(
                value = value,
                onValueChange = { onChange(it.trim().take(300)) },
                singleLine = true,
                textStyle = TrackType.Body,
                cursorBrush = SolidColor(TrackColors.Ring),
                keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else KeyboardType.Uri),
                visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun Button(label: String, primary: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(TrackShapes.Radius)
    Text(
        label,
        TrackType.BodyMedium.copy(color = if (primary) TrackColors.PrimaryForeground else TrackColors.Foreground),
        Modifier
            .pressable(onClick = onClick)
            .clip(shape)
            .background(if (primary) TrackColors.Primary else TrackColors.Secondary)
            .padding(horizontal = 16.dp, vertical = 11.dp),
    )
}

private fun openHomeSettings(context: Context) {
    runCatching {
        context.startActivity(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

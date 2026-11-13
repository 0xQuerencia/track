package art.querencia.track.ui

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import art.querencia.track.data.AppEntry
import art.querencia.track.data.AppsRepo
import uniffi.track_core.TaskItem

@Composable
fun AppIcon(repo: AppsRepo, packageName: String, size: androidx.compose.ui.unit.Dp = 52.dp) {
    val icon by produceState<ImageBitmap?>(null, packageName) { value = repo.icon(packageName) }
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        icon?.let { Image(it, contentDescription = null, modifier = Modifier.size(size)) }
    }
}

/** Search-first list of every app, under a pill search bar. */
@Composable
fun AppDrawer(
    apps: List<AppEntry>,
    repo: AppsRepo,
    favorites: List<String>,
    contentPadding: PaddingValues,
    taskMatches: suspend (String) -> List<TaskItem>,
    onLaunch: (AppEntry) -> Unit,
    onHide: (AppEntry) -> Unit,
    onToggleFavorite: (AppEntry) -> Unit,
    onSettings: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var menuFor by remember { mutableStateOf<AppEntry?>(null) }
    val searching = query.isNotBlank()

    val matches = remember(apps, query) {
        if (!searching) apps
        else apps.filter { it.label.contains(query.trim(), ignoreCase = true) }
            .sortedByDescending { it.label.startsWith(query.trim(), ignoreCase = true) }
    }
    val tasks by produceState(emptyList<TaskItem>(), query) { value = taskMatches(query.trim()) }

    Box(Modifier.fillMaxSize().background(Color(0xF0111315))) {
        Column(Modifier.fillMaxSize().padding(contentPadding)) {
            val pill = RoundedCornerShape(32.dp)
            Row(
                Modifier
                    .padding(horizontal = 18.dp, vertical = 10.dp)
                    .fillMaxWidth()
                    .clip(pill)
                    .background(Color(0xFF0B0C0D))
                    .padding(start = 24.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f).padding(vertical = 18.dp)) {
                    if (!searching) Text("Search apps", TrackType.Body.copy(fontSize = 19.sp, color = TrackColors.MutedForeground))
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it.take(60) },
                        singleLine = true,
                        textStyle = TrackType.Body.copy(fontSize = 19.sp),
                        cursorBrush = SolidColor(TrackColors.Ring),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                        keyboardActions = KeyboardActions(onGo = { matches.firstOrNull()?.let(onLaunch) }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Box(Modifier.pressable(onClick = onSettings).padding(14.dp)) { SlidersIcon(TrackColors.MutedForeground) }
            }

            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 26.dp, end = 26.dp, top = 6.dp, bottom = 12.dp)) {
                if (tasks.isNotEmpty()) item {
                    Column(Modifier.padding(bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("TASKS", TrackType.Label)
                        tasks.forEach { Text(it.title, TrackType.BodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                }
                items(matches, key = { it.packageName + it.activity }) { app ->
                    Row(
                        Modifier.fillMaxWidth().pressable(onLongClick = { menuFor = app }, scale = 0.98f) { onLaunch(app) }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        AppIcon(repo, app.packageName, 44.dp)
                        Text(app.label, TrackType.Title.copy(fontSize = 21.sp, fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (matches.isEmpty() && tasks.isEmpty()) item {
                    Text("No matches", TrackType.Small.copy(textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(24.dp))
                }
            }
        }
    }

    menuFor?.let { app ->
        val pinned = app.packageName in favorites
        ActionSheet(
            title = app.label,
            actions = listOf(
                (if (pinned) "Remove from favorites" else "Add to favorites") to { onToggleFavorite(app) },
                "Hide from drawer" to { onHide(app) },
                "App info" to { repo.appInfo(app.packageName) },
                "Uninstall" to { repo.uninstall(app.packageName) },
            ),
            onDismiss = { menuFor = null },
        )
    }
}

@Composable
fun ActionSheet(title: String, actions: List<Pair<String, () -> Unit>>, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(TrackShapes.Radius))
                .background(TrackColors.Popover)
                .border(1.dp, TrackColors.Border, RoundedCornerShape(TrackShapes.Radius))
                .padding(8.dp),
        ) {
            Text(title.uppercase(), TrackType.Label, Modifier.padding(horizontal = 12.dp, vertical = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            actions.forEach { (label, action) ->
                Text(
                    label,
                    TrackType.Body.copy(color = if (label == "Uninstall") TrackColors.Destructive else TrackColors.Foreground),
                    Modifier.fillMaxWidth().pressable(scale = 0.98f) { onDismiss(); action() }.padding(horizontal = 12.dp, vertical = 14.dp),
                )
            }
        }
    }
}

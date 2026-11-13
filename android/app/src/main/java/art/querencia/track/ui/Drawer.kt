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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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

@Composable
fun AppDrawer(
    apps: List<AppEntry>,
    repo: AppsRepo,
    dock: List<String>,
    contentPadding: PaddingValues,
    taskMatches: suspend (String) -> List<TaskItem>,
    onLaunch: (AppEntry) -> Unit,
    onHide: (AppEntry) -> Unit,
    onToggleDock: (AppEntry) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var menuFor by remember { mutableStateOf<AppEntry?>(null) }
    val matches = remember(apps, query) {
        if (query.isBlank()) apps
        else apps.filter { it.label.contains(query.trim(), ignoreCase = true) }
            // Names that start with the query come first.
            .sortedByDescending { it.label.startsWith(query.trim(), ignoreCase = true) }
    }
    val tasks by produceState(emptyList<TaskItem>(), query) { value = taskMatches(query.trim()) }

    Column(Modifier.fillMaxSize().background(TrackColors.Background).padding(contentPadding)) {
        Row(
            Modifier
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(TrackShapes.Radius))
                .background(TrackColors.Card)
                .border(1.dp, TrackColors.Border, RoundedCornerShape(TrackShapes.Radius))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SearchIcon(TrackColors.MutedForeground)
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text("Search apps and tasks", TrackType.Body.copy(color = TrackColors.MutedForeground))
                BasicTextField(
                    value = query,
                    onValueChange = { query = it.take(60) },
                    singleLine = true,
                    textStyle = TrackType.Body,
                    cursorBrush = SolidColor(TrackColors.Ring),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { matches.firstOrNull()?.let(onLaunch) }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            if (tasks.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("TASKS", TrackType.Label)
                        tasks.forEach { Text(it.title, TrackType.BodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                }
            }
            items(matches, key = { it.packageName + it.activity }) { app ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .pressable(onLongClick = { menuFor = app }) { onLaunch(app) }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    AppIcon(repo, app.packageName)
                    Text(app.label, TrackType.Small.copy(color = TrackColors.Foreground, textAlign = TextAlign.Center), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (matches.isEmpty() && tasks.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text("No matches", TrackType.Small.copy(textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(24.dp))
                }
            }
        }
    }

    menuFor?.let { app ->
        val pinned = app.packageName in dock
        ActionSheet(
            title = app.label,
            actions = listOf(
                (if (pinned) "Remove from dock" else "Add to dock") to { onToggleDock(app) },
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

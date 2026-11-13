package art.querencia.track

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import art.querencia.track.data.AppEntry
import art.querencia.track.ui.AppDrawer
import art.querencia.track.ui.AppIcon
import art.querencia.track.ui.GridIcon
import art.querencia.track.ui.HomeScreen
import art.querencia.track.ui.SettingsScreen
import art.querencia.track.ui.TrackColors
import art.querencia.track.ui.Text
import art.querencia.track.ui.TrackType
import art.querencia.track.ui.pressable

private enum class Overlay { None, Drawer, Settings }

class MainActivity : ComponentActivity() {
    private val vm: HomeViewModel by viewModels()
    private var packagesVersion by mutableIntStateOf(0)
    private var homePresses by mutableIntStateOf(0)

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            packagesVersion++
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContent { TrackRoot(vm, application as TrackApp, packagesVersion, homePresses) }
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        androidx.core.content.ContextCompat.registerReceiver(
            this, packageReceiver, filter, androidx.core.content.ContextCompat.RECEIVER_EXPORTED,
        )
    }

    override fun onStop() {
        unregisterReceiver(packageReceiver)
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        vm.refresh()
        vm.syncSoon()
    }

    /** Pressing Home while already here returns to the home screen. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) homePresses++
    }
}

@Composable
private fun TrackRoot(vm: HomeViewModel, app: TrackApp, packagesVersion: Int, homePresses: Int) {
    val today by vm.today.collectAsStateWithLifecycle()
    val syncState by vm.syncState.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()

    var apps by remember { mutableStateOf<List<AppEntry>>(emptyList()) }
    var hidden by remember { mutableStateOf(app.prefs.hidden) }
    var dockPins by remember { mutableStateOf(app.prefs.dock) }
    var overlay by remember { mutableStateOf(Overlay.None) }

    LaunchedEffect(packagesVersion) { apps = app.apps.load() }
    LaunchedEffect(homePresses) { overlay = Overlay.None }
    BackHandler(enabled = overlay != Overlay.None) { overlay = Overlay.None }

    val visible = apps.filter { it.packageName !in hidden }
    val dock = dockPins ?: app.apps.defaultDock(apps)
    val dockEntries = dock.mapNotNull { pkg -> apps.firstOrNull { it.packageName == pkg } }.take(4)

    fun saveDock(list: List<String>) {
        dockPins = list
        app.prefs.dock = list
    }

    Box(Modifier.fillMaxSize().background(TrackColors.Background)) {
        HomeScreen(
            today = today,
            syncState = syncState,
            contentPadding = PaddingValues(top = 56.dp, bottom = 120.dp),
            onSettings = { overlay = Overlay.Settings },
            onToggleTask = { t -> vm.change { e, _ -> e.setTaskStatus(t.id, "Done") } },
            onAddTask = { title -> vm.change { e, _ -> e.addTask(title, "Medium", null, null) } },
            onToggleHabit = { h -> vm.change { e, date -> e.toggleHabit(h.id, date) } },
        )

        Dock(
            entries = dockEntries,
            app = app,
            onLaunch = app.apps::launch,
            onOpenDrawer = { overlay = Overlay.Drawer },
            modifier = Modifier.align(Alignment.BottomCenter),
        )

        message?.let {
            LaunchedEffect(it) {
                kotlinx.coroutines.delay(3500)
                vm.clearMessage()
            }
            Text(
                it,
                TrackType.BodyMedium.copy(color = TrackColors.PrimaryForeground),
                Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(top = 8.dp)
                    .background(TrackColors.Destructive, androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            )
        }

        val insets = PaddingValues(top = 56.dp, bottom = 24.dp)
        AnimatedVisibility(
            visible = overlay == Overlay.Drawer,
            enter = slideInVertically { it / 3 } + fadeIn(),
            exit = slideOutVertically { it / 3 } + fadeOut(),
        ) {
            AppDrawer(
                apps = visible,
                repo = app.apps,
                dock = dock,
                contentPadding = insets,
                taskMatches = vm::searchTasks,
                onLaunch = { overlay = Overlay.None; app.apps.launch(it) },
                onHide = { a -> hidden = hidden + a.packageName; app.prefs.hidden = hidden },
                onToggleDock = { a ->
                    saveDock(if (a.packageName in dock) dock - a.packageName else (dock + a.packageName).takeLast(4))
                },
            )
        }
        AnimatedVisibility(
            visible = overlay == Overlay.Settings,
            enter = slideInVertically { it / 3 } + fadeIn(),
            exit = slideOutVertically { it / 3 } + fadeOut(),
        ) {
            SettingsScreen(
                prefs = app.prefs,
                hiddenApps = apps.filter { it.packageName in hidden },
                contentPadding = insets,
                onSyncNow = vm::syncNow,
                onUnhide = { a -> hidden = hidden - a.packageName; app.prefs.hidden = hidden },
                onClose = { overlay = Overlay.None },
            )
        }
    }
}

@Composable
private fun Dock(
    entries: List<AppEntry>,
    app: TrackApp,
    onLaunch: (AppEntry) -> Unit,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var dragged by remember { mutableStateOf(0f) }
    Row(
        modifier
            .fillMaxWidth()
            .background(TrackColors.Background.copy(alpha = 0.92f))
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp)
            // Swiping up on the dock opens the drawer.
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { dragged = 0f },
                    onVerticalDrag = { _, dy ->
                        dragged += dy
                        if (dragged < -50f) { dragged = 0f; onOpenDrawer() }
                    },
                )
            },
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        entries.forEach { entry ->
            Box(Modifier.pressable { onLaunch(entry) }.padding(6.dp)) { AppIcon(app.apps, entry.packageName, 50.dp) }
        }
        Box(Modifier.pressable(onClick = onOpenDrawer).padding(14.dp)) { GridIcon(TrackColors.Foreground, 26.dp) }
    }
}

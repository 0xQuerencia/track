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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.shape.RoundedCornerShape
import art.querencia.track.ui.ActionSheet
import art.querencia.track.ui.NiagaraHome
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import art.querencia.track.data.AppEntry
import art.querencia.track.ui.AppDrawer
import art.querencia.track.ui.HomeScreen
import art.querencia.track.ui.SettingsScreen
import art.querencia.track.ui.TrackColors
import art.querencia.track.ui.Text
import art.querencia.track.ui.TrackType

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
    val insights by vm.insights.collectAsStateWithLifecycle()
    val syncState by vm.syncState.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()

    var apps by remember { mutableStateOf<List<AppEntry>>(emptyList()) }
    var hidden by remember { mutableStateOf(app.prefs.hidden) }
    var pinned by remember { mutableStateOf(app.prefs.dock) }
    var overlay by remember { mutableStateOf(Overlay.None) }
    var menuFor by remember { mutableStateOf<AppEntry?>(null) }
    val pager = rememberPagerState(pageCount = { 2 })
    val scope = rememberCoroutineScope()

    LaunchedEffect(packagesVersion) { apps = app.apps.load() }
    LaunchedEffect(homePresses) {
        overlay = Overlay.None
        pager.animateScrollToPage(0)
    }
    BackHandler(enabled = overlay != Overlay.None || pager.currentPage != 0) {
        if (overlay != Overlay.None) overlay = Overlay.None else scope.launch { pager.animateScrollToPage(0) }
    }

    val visible = apps.filter { it.packageName !in hidden }
    val favoritePkgs = pinned ?: app.apps.defaultDock(apps)
    val favorites = favoritePkgs.mapNotNull { pkg -> visible.firstOrNull { it.packageName == pkg } }.take(7)

    fun toggleFavorite(a: AppEntry) {
        val next = if (a.packageName in favoritePkgs) favoritePkgs - a.packageName else (favoritePkgs + a.packageName).takeLast(7)
        pinned = next
        app.prefs.dock = next
    }
    fun hide(a: AppEntry) {
        hidden = hidden + a.packageName
        app.prefs.hidden = hidden
    }

    val bars = WindowInsets.systemBars.asPaddingValues()
    Box(Modifier.fillMaxSize()) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            if (page == 0) {
                NiagaraHome(
                    favorites = favorites,
                    allApps = visible,
                    repo = app.apps,
                    today = today,
                    resetSignal = homePresses,
                    onLaunch = app.apps::launch,
                    onAppMenu = { menuFor = it },
                    onOpenDrawer = { overlay = Overlay.Drawer },
                    onOpenDashboard = { scope.launch { pager.animateScrollToPage(1) } },
                    onSettings = { overlay = Overlay.Settings },
                )
            } else {
                Box(Modifier.fillMaxSize().background(TrackColors.Background)) {
                    HomeScreen(
                        today = today,
                        insights = insights,
                        syncState = syncState,
                        contentPadding = PaddingValues(top = bars.calculateTopPadding() + 8.dp, bottom = bars.calculateBottomPadding() + 24.dp),
                        onSettings = { overlay = Overlay.Settings },
                        onToggleTask = { t -> vm.change { e, _ -> e.setTaskStatus(t.id, "Done") } },
                        onAddTask = { title -> vm.change { e, _ -> e.addTask(title, "Medium", null, null) } },
                        onToggleHabit = { h -> vm.change { e, date -> e.toggleHabit(h.id, date) } },
                    )
                }
            }
        }

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
                    .background(TrackColors.Destructive, RoundedCornerShape(4.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            )
        }

        val insets = PaddingValues(top = bars.calculateTopPadding(), bottom = bars.calculateBottomPadding())
        AnimatedVisibility(
            visible = overlay == Overlay.Drawer,
            enter = slideInVertically { it / 3 } + fadeIn(),
            exit = slideOutVertically { it / 3 } + fadeOut(),
        ) {
            AppDrawer(
                apps = visible,
                repo = app.apps,
                favorites = favoritePkgs,
                contentPadding = insets,
                taskMatches = vm::searchTasks,
                onLaunch = { overlay = Overlay.None; app.apps.launch(it) },
                onHide = ::hide,
                onToggleFavorite = ::toggleFavorite,
                onSettings = { overlay = Overlay.Settings },
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

    menuFor?.let { a ->
        ActionSheet(
            title = a.label,
            actions = listOf(
                (if (a.packageName in favoritePkgs) "Remove from favorites" else "Add to favorites") to { toggleFavorite(a) },
                "Hide from home" to { hide(a) },
                "App info" to { app.apps.appInfo(a.packageName) },
                "Uninstall" to { app.apps.uninstall(a.packageName) },
            ),
            onDismiss = { menuFor = null },
        )
    }
}

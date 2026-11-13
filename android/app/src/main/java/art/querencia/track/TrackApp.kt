package art.querencia.track

import android.app.Application
import art.querencia.track.data.AppsRepo
import art.querencia.track.data.Prefs
import art.querencia.track.data.SyncManager
import art.querencia.track.data.SyncWorker
import java.io.File
import uniffi.track_core.Engine

/** Process-wide singletons. Small enough that a DI framework would be pure weight. */
class TrackApp : Application() {
    lateinit var engine: Engine
        private set
    lateinit var prefs: Prefs
        private set
    lateinit var sync: SyncManager
        private set
    lateinit var apps: AppsRepo
        private set

    override fun onCreate() {
        super.onCreate()
        engine = Engine.open(File(filesDir, "track.db").path)
        prefs = Prefs(this)
        sync = SyncManager(engine, prefs)
        apps = AppsRepo(this)
        SyncWorker.schedule(this)
    }
}

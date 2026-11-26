package art.querencia.track.data

import org.junit.Assert.*
import org.junit.Test

class FocusGuardTest {
    @Test fun explicitPackageAndBoundedLease() {
        val selected = FocusGuard().toggle("example.social")
        assertFalse(selected.blocks("example.social", 1000))
        val guard = selected.start(25, 1000)
        assertTrue(guard.blocks("example.social", 1001))
        assertFalse(guard.blocks("example.phone", 1001))
        assertFalse(guard.blocks("example.social", 1000 + 25 * 60_000L))
        assertFalse(guard.stop().blocks("example.social", 1001))
        assertFalse(guard.toggle("example.social").blocks("example.social", 1001))
    }
    @Test fun emptySelectionAndOutOfRangeDurationRejected() {
        assertThrows(IllegalArgumentException::class.java) { FocusGuard().start(25, 1000) }
        assertThrows(IllegalArgumentException::class.java) { FocusGuard(setOf("example.social")).start(181, 1000) }
    }
}

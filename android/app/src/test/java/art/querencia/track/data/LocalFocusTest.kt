package art.querencia.track.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class LocalFocusTest {
    @Test fun onlyActualFullMinutesAreCountedAndTimeCapsAtTarget() {
        val timer = LocalFocus("2026-11-27", "Chemistry", 25, 12_000L)
        assertEquals(0u, timer.completedMinutes(71_999L))
        assertEquals(1u, timer.completedMinutes(72_000L))
        assertEquals(25u, timer.completedMinutes(12_000L + 90 * 60_000L))
        assertEquals(0L, timer.remainingSeconds(12_000L + 25 * 60_000L))
    }

    @Test fun safeClockAndDurationBounds() {
        val timer = LocalFocus("2026-11-27", "Chemistry", 25, 12_000L)
        assertEquals(1500L, timer.remainingSeconds(11_999L))
        assertEquals(1L, timer.remainingSeconds(12_000L + 25 * 60_000L - 1L))
        assertThrows(IllegalArgumentException::class.java) { LocalFocus("2026-11-27", "Bad", 0, 0L) }
        assertThrows(IllegalArgumentException::class.java) { LocalFocus("2026-11-27", "Bad", 25, Long.MAX_VALUE) }
    }
}

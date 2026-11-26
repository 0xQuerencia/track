package art.querencia.track.data

import org.junit.Assert.*
import org.junit.Test

class UsageIntervalsTest {
    @Test fun pairsOnlyExplicitEventsAndNeverRetainsAppIdentity() {
        val marks = listOf(
            UsageMark(1000, UsageKind.Foreground, "private.app"),
            UsageMark(3000, UsageKind.Background, "private.app"),
            UsageMark(4000, UsageKind.Foreground, "other.app"),
        )
        val result = usageIntervals(marks, 0, 8000)
        assertEquals(1, result.size)
        assertEquals(1000L, result[0].startMs)
        assertEquals(3000L, result[0].endMs)
        assertFalse(result.toString().contains("private.app"))
        assertEquals(result, usageIntervals(marks, 0, 8000))
    }

    @Test fun screenOffClosesAndLockedEventsAreIgnored() {
        val marks = listOf(
            UsageMark(1000, UsageKind.Foreground, "a"),
            UsageMark(2000, UsageKind.Locked),
            UsageMark(3000, UsageKind.Foreground, "b"),
            UsageMark(4000, UsageKind.Unlocked),
            UsageMark(5000, UsageKind.Foreground, "b"),
            UsageMark(6000, UsageKind.ScreenOff),
        )
        assertEquals(listOf(1000L to 2000L, 5000L to 6000L),
            usageIntervals(marks, 0, 7000).map { it.startMs to it.endMs })
        assertTrue(usageIntervals(marks, 6100, 7000).isEmpty())
    }
}

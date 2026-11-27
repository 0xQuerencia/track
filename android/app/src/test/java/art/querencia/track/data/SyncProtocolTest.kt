package art.querencia.track.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncProtocolTest {
    private val token = "synthetic-test-token-1234567890"

    @Test fun onlyCanonicalBareHttpsOriginIsAccepted() {
        assertEquals("https://track.example", TrackConnection.origin(" HTTPS://TRACK.EXAMPLE:443/ "))
        assertEquals("https://track.example:8443", TrackConnection.origin("https://track.example:8443"))
        for (url in listOf("http://track.example", "https://track.example/prefix",
            "https://track.example?redirect=1", "https://track.example/#section",
            "https://owner:secret@track.example", "https://track.example:", "https://track.example:99999",
            "//track.example", "https://")) {
            assertThrows(url, IllegalArgumentException::class.java) { TrackConnection.origin(url) }
        }
    }

    @Test fun storedOriginRemainsBoundEvenAfterLosingTheKey() {
        assertThrows(IllegalArgumentException::class.java) {
            TrackConnection.forPairing("https://other.example", token, "https://track.example", null)
        }
        val sameSite = TrackConnection.forPairing("https://TRACK.example:443/", "", "https://track.example", token)
        assertEquals("https://track.example", sameSite.origin)
        assertEquals(token, sameSite.token)
        assertThrows(IllegalArgumentException::class.java) {
            TrackConnection.forPairing("https://track.example", "", "", token)
        }
        assertTrue(!sameSite.toString().contains(token))
        assertThrows(IllegalArgumentException::class.java) {
            TrackConnection.forPairing("https://track.example", token + "\r\nbad", "", null)
        }
    }

    @Test fun failedVerificationOrSnapshotCannotSaveCandidate() {
        val candidate = TrackConnection.forPairing("https://track.example", token, "", null)
        val steps = mutableListOf<String>()
        assertThrows(ApiException::class.java) {
            verifyAndSave(candidate, fetch = { throw ApiException("Token rejected.", 401) },
                apply = { steps.add("apply") }, save = { steps.add("save") })
        }
        assertThrows(IllegalArgumentException::class.java) {
            verifyAndSave(candidate, fetch = { "partial" },
                apply = { throw IllegalArgumentException("Not a snapshot") }, save = { steps.add("save") })
        }
        assertTrue(steps.isEmpty())
        verifyAndSave(candidate, fetch = { steps.add("read"); "complete" },
            apply = { steps.add("validate") }, save = { steps.add("save") })
        assertEquals(listOf("read", "validate", "save"), steps)
    }

    @Test fun outboxStopsAtNoProgressAndSurfacesRefusals() {
        var pending = 8u
        var calls = 0
        val report = drainOutbox(pending = { pending }, sendBatch = {
            calls++
            if (calls == 1) {
                pending -= 3u
                BatchProgress(2u, 1u)
            } else BatchProgress(0u, 0u)
        })
        assertEquals(2, calls)
        assertEquals(SyncReport(5u, 1u), report)
    }

    @Test fun outboxDoesNotSendEmptyBatchesAndIsBounded() {
        var calls = 0
        val before = drainOutbox(pending = { 0u }, sendBatch = { error("nothing to send") })
        assertEquals(SyncReport(0u, 0u), before)
        var pending = 40u
        val limited = drainOutbox(pending = { pending }, sendBatch = {
            calls++; pending--; BatchProgress(1u, 0u)
        })
        assertEquals(20, calls)
        assertEquals(SyncReport(20u, 0u), limited)
    }
}

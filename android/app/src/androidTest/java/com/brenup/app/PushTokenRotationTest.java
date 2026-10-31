package com.brenup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises FCM token rotation with the test APK's preferences, never the app's user settings. */
@RunWith(AndroidJUnit4.class)
public class PushTokenRotationTest {
    private SharedPreferences preferences;

    @Before
    public void setUp() {
        Context testContext = InstrumentationRegistry.getInstrumentation().getContext();
        preferences = testContext.getSharedPreferences(BrenUpMessagingService.PREFERENCES, Context.MODE_PRIVATE);
        preferences.edit().clear().commit();
    }

    @After
    public void tearDown() {
        preferences.edit().clear().commit();
    }

    @Test
    public void successfulIntermediateRefreshRebasesTheQueuedRotation() {
        Context testContext = InstrumentationRegistry.getInstrumentation().getContext();
        BrenUpMessagingService.setRegistrationEnabled(testContext, true, "registered-token");
        preferences.edit()
                .putString(BrenUpMessagingService.KEY_PENDING_TOKEN, "newest-token")
                .putString(BrenUpMessagingService.KEY_PENDING_PREVIOUS_TOKEN, "registered-token")
                .commit();

        BrenUpMessagingService.clearPendingToken(testContext, "in-flight-token");

        assertEquals("in-flight-token", preferences.getString(BrenUpMessagingService.KEY_REGISTERED_TOKEN, null));
        assertEquals("newest-token", preferences.getString(BrenUpMessagingService.KEY_PENDING_TOKEN, null));
        assertEquals("in-flight-token", preferences.getString(BrenUpMessagingService.KEY_PENDING_PREVIOUS_TOKEN, null));
        assertTrue(preferences.getBoolean(BrenUpMessagingService.KEY_REGISTRATION_ENABLED, false));
    }

    @Test
    public void acknowledgingCurrentPendingTokenClearsTheQueue() {
        Context testContext = InstrumentationRegistry.getInstrumentation().getContext();
        BrenUpMessagingService.setRegistrationEnabled(testContext, true, "registered-token");
        preferences.edit()
                .putString(BrenUpMessagingService.KEY_PENDING_TOKEN, "new-token")
                .putString(BrenUpMessagingService.KEY_PENDING_PREVIOUS_TOKEN, "registered-token")
                .commit();

        BrenUpMessagingService.clearPendingToken(testContext, "new-token");

        assertEquals("new-token", preferences.getString(BrenUpMessagingService.KEY_REGISTERED_TOKEN, null));
        assertFalse(preferences.contains(BrenUpMessagingService.KEY_PENDING_TOKEN));
        assertFalse(preferences.contains(BrenUpMessagingService.KEY_PENDING_PREVIOUS_TOKEN));
        assertTrue(preferences.getBoolean(BrenUpMessagingService.KEY_REGISTRATION_ENABLED, false));
    }
}

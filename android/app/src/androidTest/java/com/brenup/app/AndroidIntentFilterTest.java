package com.brenup.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Checks that Android App Links open shareable content and the native OAuth return. */
@RunWith(AndroidJUnit4.class)
public class AndroidIntentFilterTest {
    private boolean resolvesToBrenUp(String rawUri) {
        String appPackage = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        PackageManager packageManager = InstrumentationRegistry.getInstrumentation()
                .getTargetContext().getPackageManager();
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUri))
                .addCategory(Intent.CATEGORY_DEFAULT)
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .setPackage(appPackage);
        List<ResolveInfo> handlers = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
        for (ResolveInfo handler : handlers) {
            if (handler.activityInfo != null && appPackage.equals(handler.activityInfo.packageName)) return true;
        }
        return false;
    }

    @Test
    public void appLinksMatchOnlyTheConfiguredFirstPartyHosts() {
        assertTrue(resolvesToBrenUp("https://www.brenup.com/lessons/example"));
        assertTrue(resolvesToBrenUp("https://brenup.com/live/example"));
        assertTrue(resolvesToBrenUp("https://www.brenup.com/live/join/code"));
        assertTrue(resolvesToBrenUp("https://www.brenup.com/live-classes"));
        assertFalse(resolvesToBrenUp("https://www.brenup.com/livestream"));
        assertTrue(resolvesToBrenUp("https://www.brenup.com/auth/android-callback?code=test"));
        assertTrue(resolvesToBrenUp("https://brenup.com/auth/android-callback?code=test"));
        assertFalse(resolvesToBrenUp("https://www.brenup.com/auth/callback?code=test"));
        assertFalse(resolvesToBrenUp("https://www.brenup.com/account"));
        assertFalse(resolvesToBrenUp("https://media.brenup.com/file.mp4"));
        assertFalse(resolvesToBrenUp("https://www.brenup.com.attacker.test/"));
    }

    @Test
    public void customSchemeMatchesOnlyDeclaredAuthPaths() {
        assertTrue(resolvesToBrenUp("com.brenup.app://auth/callback?code=test"));
        assertTrue(resolvesToBrenUp("com.brenup.app://auth/reset-password?code=test"));
        assertFalse(resolvesToBrenUp("com.brenup.app://auth/unlisted"));
        assertFalse(resolvesToBrenUp("com.other.app://auth/callback"));
    }
}

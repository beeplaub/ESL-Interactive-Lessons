package com.brenup.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Verifies the exact-origin boundary used by WebView navigation and the native bridge. */
@RunWith(AndroidJUnit4.class)
public class BrenUpUriPolicyTest {
    @Test
    public void acceptsOnlyTheFirstPartyHttpsOrigins() {
        assertTrue(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://www.brenup.com/lessons")));
        assertTrue(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://brenup.com/account")));
        assertTrue(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://www.brenup.com:443/")));
    }

    @Test
    public void rejectsLookalikeHostsCredentialsAndUnexpectedSchemesOrPorts() {
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://www.brenup.com.attacker.test/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://brenup.com.attacker.test/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://user@www.brenup.com/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("http://www.brenup.com/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse("https://www.brenup.com:8443/")));
    }

    @Test
    public void bridgeOriginMustNotContainPathQueryOrFragment() {
        assertTrue(BrenUpUriPolicy.isTrustedBrenUpOrigin(Uri.parse("https://www.brenup.com/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpOrigin(Uri.parse("https://www.brenup.com/path")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpOrigin(Uri.parse("https://www.brenup.com/?next=/")));
        assertFalse(BrenUpUriPolicy.isTrustedBrenUpOrigin(Uri.parse("https://www.brenup.com/#fragment")));
    }

    @Test
    public void acceptsOnlyTheDeclaredNativeAuthCallbacks() {
        assertTrue(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://auth/callback?code=test")));
        assertTrue(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://auth/reset-password?code=test")));
        assertFalse(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.other.app://auth/callback")));
        assertFalse(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://other/callback")));
        assertFalse(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://auth/unlisted")));
        assertFalse(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://user@auth/callback")));
        assertFalse(BrenUpUriPolicy.isBrenUpAuthCallback(Uri.parse("com.brenup.app://auth:443/callback")));
    }

    @Test
    public void existingActivityAcceptsOnlyFirstPartyLinksAndDeclaredAuthCallbacks() {
        assertTrue(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("https://www.brenup.com/lessons/42")));
        assertTrue(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("https://brenup.com/live/class")));
        assertTrue(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("com.brenup.app://auth/callback?code=test")));
        assertTrue(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("com.brenup.app://auth/reset-password?code=test")));
        assertFalse(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("https://outside.example/")));
        assertFalse(BrenUpUriPolicy.isInternalLaunchUri(Uri.parse("com.brenup.app://auth/unlisted")));
    }

    @Test
    public void authCallbacksReturnCodesToTheirExistingWebRoutes() {
        assertEquals("https://www.brenup.com/auth/callback?code=pkce-code&next=%2Flessons%2F42",
                BrenUpUriPolicy.resolveLaunchUrl(Uri.parse(
                        "com.brenup.app://auth/callback?code=pkce-code&next=%2Flessons%2F42")));
        assertEquals("https://www.brenup.com/auth/reset-password?code=reset-code",
                BrenUpUriPolicy.resolveLaunchUrl(Uri.parse(
                        "com.brenup.app://auth/reset-password?code=reset-code")));
    }

    @Test
    public void authCallbackDropsExternalOrMalformedNextDestinations() {
        assertEquals("https://www.brenup.com/auth/callback?code=pkce-code",
                BrenUpUriPolicy.resolveLaunchUrl(Uri.parse(
                        "com.brenup.app://auth/callback?code=pkce-code&next=%2F%2Fevil.test")));
        assertEquals("https://www.brenup.com/auth/callback?code=pkce-code",
                BrenUpUriPolicy.resolveLaunchUrl(Uri.parse(
                        "com.brenup.app://auth/callback?code=pkce-code&next=%2F%5C%5Cevil.test")));
        assertEquals(BrenUpUriPolicy.HOME_URL,
                BrenUpUriPolicy.resolveLaunchUrl(Uri.parse("com.other.app://auth/callback?code=x")));
    }

    @Test
    public void offlineRetryPreservesOnlyTrustedFirstPartyRoutes() {
        assertEquals("https://www.brenup.com/lessons/42?from=invite&mode=review",
                BrenUpUriPolicy.resolveOfflineRetryUrl(Uri.parse(
                        "https://www.brenup.com/lessons/42?from=invite&mode=review")));
        assertEquals(BrenUpUriPolicy.HOME_URL,
                BrenUpUriPolicy.resolveOfflineRetryUrl(Uri.parse("https://evil.example/redirect")));
        assertEquals(BrenUpUriPolicy.HOME_URL,
                BrenUpUriPolicy.resolveOfflineRetryUrl(Uri.parse("javascript:alert(1)")));
    }

    @Test
    public void downloadsAreLimitedToTheThreeApprovedHttpsHosts() {
        assertTrue(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("https://www.brenup.com/file.pdf")));
        assertTrue(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("https://brenup.com/file.pdf")));
        assertTrue(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("https://media.brenup.com/file.mp4")));
        assertFalse(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("https://cdn.brenup.com/file.pdf")));
        assertFalse(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("https://media.brenup.com.attacker.test/file.mp4")));
        assertFalse(BrenUpUriPolicy.isAllowedDownloadUri(Uri.parse("http://media.brenup.com/file.mp4")));
    }

    @Test
    public void externalIntentsAllowWebLinksAndExistingMailLinksOnly() {
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("https://outside.example/path")));
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("http://outside.example/path")));
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("mailto:support@brenup.com?subject=Help")));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("intent://outside.example/#Intent;scheme=https;end")));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("javascript:alert(1)")));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("file:///data/local/tmp/file")));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("https://user@outside.example/path")));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri(Uri.parse("mailto:")));
    }

    @Test
    public void notificationHrefsAcceptFirstPartyUrlsAndSafeRelativePathsOnly() {
        assertEquals("https://www.brenup.com/lessons/example",
                BrenUpUriPolicy.fromNotificationHref("/lessons/example").toString());
        assertTrue(BrenUpUriPolicy.fromNotificationHref("https://brenup.com/live/example") != null);
        assertNull(BrenUpUriPolicy.fromNotificationHref("https://evil.test/account"));
        assertNull(BrenUpUriPolicy.fromNotificationHref("//evil.test/account"));
        assertNull(BrenUpUriPolicy.fromNotificationHref("/\\\\evil.test/account"));
        assertNull(BrenUpUriPolicy.fromNotificationHref("javascript:alert(1)"));
    }
}

package com.brenup.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Host-side tests for the native URL navigation policy. */
public class BrenUpUriPolicyTest {

    @Test
    public void externalIntentPolicyAllowsOnlyWebAndMailSchemes() {
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri("https", "outside.example", null, "//outside.example"));
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri("http", "outside.example", null, "//outside.example"));
        assertTrue(BrenUpUriPolicy.isAllowedExternalUri("mailto", null, null, "support@brenup.com?subject=Help"));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri("intent", null, null, "//outside.example"));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri("javascript", null, null, "alert(1)"));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri("file", null, null, "///data/local/tmp/file"));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri("https", "outside.example", "user", "//user@outside.example"));
        assertFalse(BrenUpUriPolicy.isAllowedExternalUri("mailto", null, null, " "));
    }
}

package com.brenup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Smoke-checks native shell startup and its WebView security defaults without reading page content. */
@RunWith(AndroidJUnit4.class)
public class MainActivitySmokeTest {
    @Test
    public void launchesSecureWebViewInsideSystemBarSafeArea() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                View content = activity.findViewById(android.R.id.content);
                assertNotNull(content);
                assertTrue(content instanceof ViewGroup);
                ViewGroup root = (ViewGroup) content;
                assertEquals(1, root.getChildCount());
                assertTrue(root.getChildAt(0) instanceof WebView);

                WebView webView = (WebView) root.getChildAt(0);
                WebSettings settings = webView.getSettings();
                assertTrue(settings.getJavaScriptEnabled());
                assertFalse(settings.getJavaScriptCanOpenWindowsAutomatically());
                assertFalse(settings.supportMultipleWindows());
                assertFalse(settings.getAllowFileAccess());
                assertFalse(settings.getAllowContentAccess());
                assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, settings.getMixedContentMode());
                assertTrue(CookieManager.getInstance().acceptCookie());
                assertFalse(CookieManager.getInstance().acceptThirdPartyCookies(webView));
                assertTrue(root.getPaddingTop() > 0);
                assertTrue(root.getPaddingBottom() > 0);
                assertEquals(root.getPaddingTop(), webView.getTop());
            });
        }
    }

    @Test
    public void webViewRuntimeHasTheLocalRecordingPrimitives() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CountDownLatch evaluated = new CountDownLatch(1);
            AtomicReference<String> result = new AtomicReference<>();
            scenario.onActivity(activity -> {
                ViewGroup root = (ViewGroup) activity.findViewById(android.R.id.content);
                WebView webView = (WebView) root.getChildAt(0);
                webView.evaluateJavascript(
                        "(function(){return [typeof MediaRecorder==='function',typeof MediaStream==='function'," +
                                "typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function'," +
                                "typeof indexedDB!=='undefined'].join(',')})()",
                        value -> { result.set(value); evaluated.countDown(); });
            });
            assertTrue("WebView feature query did not return", evaluated.await(10, TimeUnit.SECONDS));
            assertEquals("\"true,true,true,true\"", result.get());
        }
    }
}

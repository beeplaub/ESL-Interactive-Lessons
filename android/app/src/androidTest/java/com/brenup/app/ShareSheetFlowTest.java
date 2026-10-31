package com.brenup.app;

import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Confirms trusted WebView share requests reach Android's Sharesheet without sending them. */
@RunWith(AndroidJUnit4.class)
public class ShareSheetFlowTest {
    private static final String SHARED_TEXT = "BrenUp synthetic share fixture";

    @Test
    public void trustedShareRequestOpensSystemSharesheet() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                webView.loadDataWithBaseURL(BrenUpUriPolicy.HOME_URL + "/android-test",
                        "<!doctype html><p>Local share test.</p>", "text/html", "UTF-8",
                        BrenUpUriPolicy.HOME_URL + "/android-test");
            });
            assertTrue("Trusted native bridge did not load", waitForJavascript(scenario,
                    "typeof window.BrenUpAndroid==='object'", 10_000));

            evaluateJavascript(scenario, "window.BrenUpAndroid.postMessage(JSON.stringify({" +
                    "id:'share-sheet-test',method:'shareContent',title:'BrenUp share test'," +
                    "text:'" + SHARED_TEXT + "',url:'" + BrenUpUriPolicy.HOME_URL + "/quizzes'}));true");

            android.app.Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
            assertTrue("Android Sharesheet did not display the synthetic content",
                    waitForText(instrumentation, SHARED_TEXT, 10_000));
            instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    private static boolean waitForJavascript(ActivityScenario<MainActivity> scenario, String script,
                                            long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluateJavascript(scenario, script))) return true;
            SystemClock.sleep(150);
        }
        return false;
    }

    private static String evaluateJavascript(ActivityScenario<MainActivity> scenario, String script)
            throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
            webView.evaluateJavascript(script, value -> { result.set(value); evaluated.countDown(); });
        });
        return evaluated.await(2, TimeUnit.SECONDS) ? result.get() : null;
    }

    private static boolean waitForText(android.app.Instrumentation instrumentation, String text,
                                       long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                try {
                    if (!root.findAccessibilityNodeInfosByText(text).isEmpty()) return true;
                } finally {
                    root.recycle();
                }
            }
            SystemClock.sleep(100);
        }
        return false;
    }
}

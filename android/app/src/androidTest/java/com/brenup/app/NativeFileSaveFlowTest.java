package com.brenup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityService;
import android.app.Instrumentation;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import android.view.ViewGroup;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises a synthetic recording save through Android's document picker and native bridge. */
@RunWith(AndroidJUnit4.class)
public class NativeFileSaveFlowTest {
    private static final String START_ID = "native-file-save-start";
    private static final String CHUNK_ID = "native-file-save-chunk";
    private static final String FINISH_ID = "native-file-save-finish";

    @Test
    public void pickerAcceptsChunkedRecordingAndConfirmsSave() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                webView.loadDataWithBaseURL(BrenUpUriPolicy.HOME_URL + "/android-test",
                        "<!doctype html><p>Local file save test.</p>", "text/html", "UTF-8", null);
            });
            assertTrue("Trusted native bridge did not load", waitForJavascript(scenario, "typeof window.BrenUpAndroid==='object'", 10_000));
            evaluateJavascript(scenario, "(function(){window.__saveReplies={};window.BrenUpAndroid.addEventListener('message',function(e){var r=JSON.parse(e.data);window.__saveReplies[r.id]=r;});" +
                    "window.BrenUpAndroid.postMessage(JSON.stringify({id:'" + START_ID + "',method:'startLocalFileSave',filename:'brenup-native-save-test.webm',mimeType:'video/webm',size:'5'}));return true;})()");

            assertTrue("Android document picker did not open", waitForText(instrumentation, "SAVE", 20_000));
            assertTrue("Could not confirm the synthetic recording destination", clickText(instrumentation, "SAVE", 5_000));
            String transferId = waitForJavascriptValue(scenario,
                    "window.__saveReplies['" + START_ID + "'] ? window.__saveReplies['" + START_ID + "'].value.transferId : null", 10_000);
            assertTrue("Native save did not return a transfer ID. Reply=" + evaluateJavascript(scenario, "JSON.stringify(window.__saveReplies)")
                    + " Visible UI=" + visibleTexts(instrumentation), transferId != null && !"null".equals(transferId));

            evaluateJavascript(scenario, "window.BrenUpAndroid.postMessage(JSON.stringify({id:'" + CHUNK_ID + "',method:'appendLocalFileSaveChunk',transferId:" + transferId + ",chunk:'AQIDBAU='}));true");
            String written = waitForJavascriptValue(scenario,
                    "window.__saveReplies['" + CHUNK_ID + "'] ? String(window.__saveReplies['" + CHUNK_ID + "'].value.written) : null", 10_000);
            assertEquals("Native writer did not acknowledge the complete chunk", "\"5\"", written);

            evaluateJavascript(scenario, "window.BrenUpAndroid.postMessage(JSON.stringify({id:'" + FINISH_ID + "',method:'finishLocalFileSave',transferId:" + transferId + "}));true");
            String saved = waitForJavascriptValue(scenario,
                    "window.__saveReplies['" + FINISH_ID + "'] ? String(window.__saveReplies['" + FINISH_ID + "'].value.saved) : null", 10_000);
            assertEquals("Native save did not finish successfully", "\"true\"", saved);
        } finally {
            instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    private static boolean waitForJavascript(ActivityScenario<MainActivity> scenario, String script, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluateJavascript(scenario, script))) return true;
            SystemClock.sleep(150);
        }
        return false;
    }

    private static String evaluateJavascript(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
            webView.evaluateJavascript(script, value -> { result.set(value); evaluated.countDown(); });
        });
        return evaluated.await(2, TimeUnit.SECONDS) ? result.get() : null;
    }

    private static String waitForJavascriptValue(ActivityScenario<MainActivity> scenario, String expression, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            String value = evaluateJavascript(scenario, expression);
            if (value != null && !"null".equals(value)) return value;
            SystemClock.sleep(150);
        }
        return null;
    }

    private static boolean waitForText(Instrumentation instrumentation, String text, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                try {
                    if (!root.findAccessibilityNodeInfosByText(text).isEmpty()) return true;
                } finally { root.recycle(); }
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private static boolean clickText(Instrumentation instrumentation, String text, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                try {
                    List<AccessibilityNodeInfo> matches = root.findAccessibilityNodeInfosByText(text);
                    for (AccessibilityNodeInfo match : matches) {
                        CharSequence label = match.getText();
                        if (label == null || !text.equalsIgnoreCase(label.toString().trim())) continue;
                        AccessibilityNodeInfo node = match;
                        while (node != null && !node.isClickable()) node = node.getParent();
                        if (node != null && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                    }
                } finally { root.recycle(); }
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private static String visibleTexts(Instrumentation instrumentation) {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return "<no active window>";
        try {
            StringBuilder text = new StringBuilder();
            appendText(root, text);
            return text.toString();
        } finally { root.recycle(); }
    }

    private static void appendText(AccessibilityNodeInfo node, StringBuilder text) {
        if (node.getText() != null) text.append(node.getText()).append(" | ");
        if (node.getContentDescription() != null) text.append(node.getContentDescription()).append(" | ");
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                appendText(child, text);
                child.recycle();
            }
        }
    }
}

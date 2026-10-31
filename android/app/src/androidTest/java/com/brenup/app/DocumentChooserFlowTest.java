package com.brenup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityService;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the trusted WebView file chooser with a disposable Downloads fixture. */
@RunWith(AndroidJUnit4.class)
public class DocumentChooserFlowTest {
    private static final String FILE_NAME = "brenup-native-chooser-test.txt";

    @Test
    public void trustedWebFileInputReceivesSelectedDocument() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Uri fixture = createSyntheticDownload(context);
        assertNotNull("Could not create synthetic Downloads fixture", fixture);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<int[]> buttonCenter = new AtomicReference<>();
            scenario.onActivity(activity -> {
                WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                webView.loadDataWithBaseURL(BrenUpUriPolicy.HOME_URL + "/android-test",
                        "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                                "<style>body{margin:0}input{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;height:100px;font-size:22px}</style>" +
                                "<input id='file' type='file'><script>" +
                                "window.__inputClicked=false;window.__pickedFile=null;document.getElementById('file').addEventListener('click',function(){window.__inputClicked=true;});" +
                                "document.getElementById('file').addEventListener('change',function(){window.__pickedFile=this.files.length?this.files[0].name:'none';});</script>",
                        "text/html", "UTF-8", BrenUpUriPolicy.HOME_URL + "/android-test");
                int[] location = new int[2];
                webView.getLocationOnScreen(location);
                buttonCenter.set(new int[]{location[0] + webView.getWidth() / 2, location[1] + webView.getHeight() / 2});
            });

            assertTrue("Trusted native bridge did not load", waitForJavascript(scenario,
                    "typeof window.BrenUpAndroid==='object'", 10_000));
            int[] center = buttonCenter.get();
            assertNotNull("Could not locate file input", center);
            tap(InstrumentationRegistry.getInstrumentation(), center[0], center[1]);
            assertTrue("Injected tap did not reach the file input", waitForJavascript(scenario,
                    "window.__inputClicked===true", 3_000));

            assertTrue("Android picker did not show the synthetic file. Visible UI=" +
                            visibleTexts(InstrumentationRegistry.getInstrumentation()),
                    waitForText(InstrumentationRegistry.getInstrumentation(), FILE_NAME, 20_000));
            assertTrue("Could not select the synthetic file", clickText(
                    InstrumentationRegistry.getInstrumentation(), FILE_NAME, 5_000));
            assertEquals("Selected filename did not reach the WebView input", "\"" + FILE_NAME + "\"",
                    waitForJavascriptValue(scenario, "window.__pickedFile ? window.__pickedFile : null", 10_000));
        } finally {
            try { context.getContentResolver().delete(fixture, null, null); } catch (Exception ignored) { }
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    private static Uri createSyntheticDownload(Context context) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return null;
        try (OutputStream output = context.getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("Could not write synthetic fixture");
            output.write("synthetic BrenUp picker fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        return uri;
    }

    private static void tap(android.app.Instrumentation instrumentation, int x, int y) {
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(downTime, downTime + 80, MotionEvent.ACTION_UP, x, y, 0);
        try {
            instrumentation.getUiAutomation().injectInputEvent(down, true);
            instrumentation.getUiAutomation().injectInputEvent(up, true);
        } finally {
            down.recycle();
            up.recycle();
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

    private static boolean waitForText(android.app.Instrumentation instrumentation, String text, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                try { if (!root.findAccessibilityNodeInfosByText(text).isEmpty()) return true; }
                finally { root.recycle(); }
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private static boolean clickText(android.app.Instrumentation instrumentation, String text, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                try {
                    List<AccessibilityNodeInfo> matches = root.findAccessibilityNodeInfosByText(text);
                    for (AccessibilityNodeInfo match : matches) {
                        if (match.getText() == null || !text.equalsIgnoreCase(match.getText().toString().trim())) continue;
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

    private static String visibleTexts(android.app.Instrumentation instrumentation) {
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
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { appendText(child, text); child.recycle(); }
        }
    }
}

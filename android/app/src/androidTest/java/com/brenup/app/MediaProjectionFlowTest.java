package com.brenup.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.lifecycle.Lifecycle;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.FixMethodOrder;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;
import org.junit.Assume;

/** Verifies Android screen-capture consent, frame delivery, and cancellation on the API 37 emulator. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class MediaProjectionFlowTest {
    private static final String REQUEST_ID = "media-projection-instrumentation";

    @Test
    public void aApprovingEntireScreenDeliversARecordableFrameAndStops() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context targetContext = instrumentation.getTargetContext();
        targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("The first-party page did not establish the native bridge", waitForJavascriptBridge(scenario, 30_000));
            evaluateJavascript(scenario, "(function(){window.__bridgeResults={};window.__recordProbe=null;" +
                    "window.BrenUpAndroid.addEventListener('message',function(e){var r=JSON.parse(e.data);window.__bridgeResults[r.id]=r;});" +
                    "window.BrenUpAndroid.postMessage(JSON.stringify({id:'" + REQUEST_ID + "'," +
                    "method:'requestScreenCapturePermission',purpose:'record'}));return true;})()");

            assertTrue("Recording explanation did not appear", waitForText(instrumentation,
                    "The recording stays in this app on this device", 10_000));
            assertTrue("Could not continue from BrenUp's capture explanation", clickText(instrumentation, "Continue", 5_000));
            assertTrue("Android's screen-capture mode selector did not appear",
                    waitForText(instrumentation, "Share one app", 20_000));
            assertTrue("Could not open Android's capture-mode selector", clickText(instrumentation, "Share one app", 5_000));
            assertTrue("Android did not offer full-screen capture", waitForText(instrumentation, "Share entire screen", 5_000));
            assertTrue("Could not select full-screen capture", clickText(instrumentation, "Share entire screen", 5_000));
            assertTrue("Android's full-screen confirmation did not appear",
                    waitForText(instrumentation, "Share screen", 5_000));
            assertTrue("Could not approve Android's screen-capture consent", clickText(instrumentation, "Share screen", 5_000));

            String granted = waitForJavascriptValue(scenario,
                    "window.__bridgeResults['" + REQUEST_ID + "'] ? String(window.__bridgeResults['" + REQUEST_ID + "'].value && window.__bridgeResults['" + REQUEST_ID + "'].value.granted===true) : null", 10_000);
            assertEquals("Native bridge did not report approved capture", "\"true\"", granted);
            String frameUrl = waitForJavascriptValue(scenario,
                    "window.__bridgeResults['" + REQUEST_ID + "'] && window.__bridgeResults['" + REQUEST_ID + "'].value ? window.__bridgeResults['" + REQUEST_ID + "'].value.streamUrl : null", 3_000);
            assertTrue("Native bridge omitted the frame URL", frameUrl != null && frameUrl.startsWith("\"https://appassets.androidplatform.net/brenup-screen/"));
            evaluateJavascript(scenario, "(function(){var deadline=Date.now()+12000;function loadFrame(){var image=new Image();image.crossOrigin='anonymous';" +
                    "image.onload=function(){try{var canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;" +
                    "var context=canvas.getContext('2d');context.drawImage(image,0,0);context.getImageData(0,0,1,1);" +
                    "var stream=canvas.captureStream(8);var recorder=new MediaRecorder(stream);var bytes=0;" +
                    "recorder.ondataavailable=function(event){bytes+=event.data.size;};recorder.onstop=function(){" +
                    "window.__recordProbe={width:canvas.width,height:canvas.height,videoTracks:stream.getVideoTracks().length,bytes:bytes};" +
                    "stream.getTracks().forEach(function(track){track.stop();});};recorder.start();" +
                    "setTimeout(function(){if(recorder.state!=='inactive')recorder.stop();},1800);" +
                    "}catch(error){window.__recordProbe={error:String(error)};}};" +
                    "image.onerror=function(){if(Date.now()<deadline)setTimeout(loadFrame,125);else window.__recordProbe={error:'frame-load-timeout'};};" +
                    "image.src=" + frameUrl + "+'?instrumentation='+Date.now();}loadFrame();return true;})()");
            String recorded = waitForJavascriptValue(scenario,
                    "window.__recordProbe ? String(window.__recordProbe.videoTracks)+','+String(window.__recordProbe.bytes) : null", 20_000);
            assertTrue("Frame was not delivered into a recordable canvas: " + recorded,
                    recorded != null && recorded.matches("\"1,[1-9][0-9]*\""));

            instrumentation.getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90);
            try {
                evaluateJavascript(scenario, "(function(){window.__rotatedFrame=null;var deadline=Date.now()+15000;function load(){" +
                        "var image=new Image();image.crossOrigin='anonymous';image.onload=function(){if(image.naturalWidth>image.naturalHeight)" +
                        "window.__rotatedFrame=image.naturalWidth+'x'+image.naturalHeight;else if(Date.now()<deadline)setTimeout(load,150);};" +
                        "image.onerror=function(){if(Date.now()<deadline)setTimeout(load,150);};image.src=" + frameUrl + "+'?rotation='+Date.now();}" +
                        "load();return true;})()");
                String rotatedFrame = waitForJavascriptValue(scenario,
                        "window.__rotatedFrame ? window.__rotatedFrame : null", 20_000);
                assertTrue("Capture did not deliver a landscape frame after display rotation: " + rotatedFrame,
                        rotatedFrame != null && rotatedFrame.matches("\"[0-9]+x[0-9]+\""));
            } finally {
                instrumentation.getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
            }

            scenario.onActivity(activity -> activity.moveTaskToBack(false));
            assertTrue("Capture stopped when BrenUp was backgrounded", ScreenCaptureService.isActive());
            assertTrue("Capture foreground service stopped when BrenUp was backgrounded",
                    waitForCaptureServiceRunning(targetContext, 5_000));

            targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
            assertTrue("Capture service did not release resources after the stop request",
                    waitForCaptureServiceStopped(targetContext, 5_000));
        } finally {
            targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
            instrumentation.getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
            instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    @Test
    public void bDecliningSystemConsentReturnsDenialWithoutStartingCapture() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context targetContext = instrumentation.getTargetContext();
        targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = findWebView(activity.findViewById(android.R.id.content));
                webView.loadDataWithBaseURL(BrenUpUriPolicy.HOME_URL + "/android-test",
                        "<!doctype html><p>Local capture test.</p>", "text/html", "UTF-8", null);
            });

            assertTrue("WebView did not establish the trusted test origin", waitForJavascriptBridge(scenario, 10_000));
            evaluateJavascript(scenario, "(function(){window.__captureResult=null;window.__bridgeResults={};" +
                    "window.BrenUpAndroid.addEventListener('message',function(e){var r=JSON.parse(e.data);" +
                    "window.__bridgeResults[r.id]=r;if(r.id==='" + REQUEST_ID + "')window.__captureResult=r;});" +
                    "return true;})()");

            evaluateJavascript(scenario, "window.BrenUpAndroid.postMessage(JSON.stringify({id:'" + REQUEST_ID + "'," +
                    "method:'requestScreenCapturePermission',purpose:'record'}));true");

            boolean rationaleVisible = waitForText(instrumentation, "The recording stays in this app on this device", 10_000);
            assertTrue("BrenUp's recording-specific rationale did not appear. Visible text: " + visibleTexts(instrumentation), rationaleVisible);
            assertTrue("Could not continue from BrenUp's capture explanation", clickText(instrumentation, "Continue", 5_000));
            assertTrue("Android's screen-capture consent did not appear",
                    waitForText(instrumentation, "Next", 20_000));
            assertTrue("Could not cancel Android's screen-capture consent", clickText(instrumentation, "Cancel", 5_000));
            assertTrue("BrenUp did not resume after the Android consent screen", waitForResumed(scenario, 10_000));

            String denied = waitForJavascriptValue(scenario,
                    "window.__captureResult ? String(window.__captureResult.value && window.__captureResult.value.granted===false) : null", 10_000);
            assertEquals("Native bridge did not report a declined capture", "\"true\"", denied);
            evaluateJavascript(scenario, "window.BrenUpAndroid.postMessage(JSON.stringify({id:'denied-status',method:'isScreenSharing'}));true");
            // The rejection check uses the bridge because instrumentation and the app run in separate processes.
            String deniedStatus = waitForJavascriptValue(scenario,
                    "window.__bridgeResults && window.__bridgeResults['denied-status'] ? String(window.__bridgeResults['denied-status'].value.isSharing) : null", 5_000);
            assertEquals("Declined consent unexpectedly left sharing active", "\"false\"", deniedStatus);
        } finally {
            instrumentation.getTargetContext().stopService(new Intent(instrumentation.getTargetContext(), ScreenCaptureService.class));
            instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    @Test
    public void zRemovingAppTaskStopsAndReleasesActiveCaptureService() throws Exception {
        Assume.assumeTrue("Run separately with -e runTaskRemovalTest true because removing the app task ends its instrumentation target",
                Boolean.parseBoolean(InstrumentationRegistry.getArguments().getString("runTaskRemovalTest", "false")));
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context targetContext = instrumentation.getTargetContext();
        targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        boolean appTaskRemoved = false;
        try {
            assertTrue("The first-party page did not establish the native bridge", waitForJavascriptBridge(scenario, 30_000));
            evaluateJavascript(scenario, "(function(){window.__bridgeResults={};" +
                    "window.BrenUpAndroid.addEventListener('message',function(e){var r=JSON.parse(e.data);window.__bridgeResults[r.id]=r;});" +
                    "window.BrenUpAndroid.postMessage(JSON.stringify({id:'task-removal-capture'," +
                    "method:'requestScreenCapturePermission',purpose:'record'}));return true;})()");

            assertTrue("BrenUp's recording explanation did not appear", waitForText(instrumentation,
                    "The recording stays in this app on this device", 10_000));
            assertTrue("Could not continue from BrenUp's capture explanation", clickText(instrumentation, "Continue", 5_000));
            assertTrue("Android's screen-capture mode selector did not appear",
                    waitForText(instrumentation, "Share one app", 20_000));
            assertTrue("Could not open Android's capture-mode selector", clickText(instrumentation, "Share one app", 5_000));
            assertTrue("Android did not offer full-screen capture", waitForText(instrumentation, "Share entire screen", 5_000));
            assertTrue("Could not select full-screen capture", clickText(instrumentation, "Share entire screen", 5_000));
            assertTrue("Android's full-screen confirmation did not appear", waitForText(instrumentation, "Share screen", 5_000));
            assertTrue("Could not approve Android's screen-capture consent", clickText(instrumentation, "Share screen", 5_000));
            assertTrue("Capture service did not start after Android consent",
                    waitForCaptureServiceRunning(targetContext, 5_000));

            ActivityManager activityManager = (ActivityManager) targetContext.getSystemService(Context.ACTIVITY_SERVICE);
            assertTrue("The app task was not available for removal", activityManager != null && !activityManager.getAppTasks().isEmpty());
            appTaskRemoved = true;
            activityManager.getAppTasks().get(0).finishAndRemoveTask();
            assertTrue("Capture service remained active after its app task was removed",
                    waitForCaptureServiceStopped(targetContext, 10_000));
        } finally {
            targetContext.stopService(new Intent(targetContext, ScreenCaptureService.class));
            if (!appTaskRemoved) scenario.close();
            instrumentation.getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
        }
    }

    private static boolean waitForCaptureServiceStopped(Context context, long timeoutMs) {
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) return false;
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            boolean running = false;
            for (ActivityManager.RunningServiceInfo service : activityManager.getRunningServices(Integer.MAX_VALUE)) {
                if (ScreenCaptureService.class.getName().equals(service.service.getClassName())) {
                    running = true;
                    break;
                }
            }
            if (!running) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private static boolean waitForCaptureServiceRunning(Context context, long timeoutMs) {
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) return false;
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            for (ActivityManager.RunningServiceInfo service : activityManager.getRunningServices(Integer.MAX_VALUE)) {
                if (ScreenCaptureService.class.getName().equals(service.service.getClassName())) return true;
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private static boolean waitForJavascriptBridge(ActivityScenario<MainActivity> scenario, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluateJavascript(scenario, "typeof window.BrenUpAndroid==='object'"))) return true;
            SystemClock.sleep(200);
        }
        return false;
    }

    private static boolean waitForResumed(ActivityScenario<MainActivity> scenario, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            if (scenario.getState() == Lifecycle.State.RESUMED) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private static String evaluateJavascript(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView webView = findWebView(activity.findViewById(android.R.id.content));
            webView.evaluateJavascript(script, value -> { result.set(value); evaluated.countDown(); });
        });
        if (!evaluated.await(2, TimeUnit.SECONDS)) return null;
        return result.get();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        throw new AssertionError("MainActivity did not contain its WebView");
    }

    private static String waitForJavascriptValue(ActivityScenario<MainActivity> scenario, String expression, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            String value = evaluateJavascript(scenario, expression);
            if (value != null && !"null".equals(value)) return value;
            SystemClock.sleep(200);
        }
        return null;
    }

    private static boolean waitForText(Instrumentation instrumentation, String text, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            if (hasText(instrumentation, text)) return true;
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
                        AccessibilityNodeInfo node = match;
                        while (node != null && !node.isClickable()) node = node.getParent();
                        if (node != null && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                    }
                } finally {
                    root.recycle();
                }
            }
            SystemClock.sleep(100);
        }
        return false;
    }

    private static boolean hasText(Instrumentation instrumentation, String text) {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return false;
        try {
            return !root.findAccessibilityNodeInfosByText(text).isEmpty();
        } finally {
            root.recycle();
        }
    }

    private static String visibleTexts(Instrumentation instrumentation) {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return "<no active accessibility root>";
        try {
            StringBuilder text = new StringBuilder();
            appendText(root, text);
            return text.toString();
        } finally {
            root.recycle();
        }
    }

    private static void appendText(AccessibilityNodeInfo node, StringBuilder text) {
        CharSequence label = node.getText();
        if (label != null && label.length() > 0) text.append(label).append(" | ");
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                appendText(child, text);
                child.recycle();
            }
        }
    }
}

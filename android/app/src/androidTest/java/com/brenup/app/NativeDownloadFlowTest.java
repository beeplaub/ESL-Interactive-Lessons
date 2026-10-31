package com.brenup.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Verifies that trusted WebView downloads reach DownloadManager using a public icon fixture. */
@RunWith(AndroidJUnit4.class)
public class NativeDownloadFlowTest {
    private static final String FILE_NAME = "icon-192.png";
    private static final String PUBLIC_FILE = "/brand/icon-192.png";

    @Test
    public void firstPartyWebDownloadCompletesAndIsRemoved() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        assertNotNull("Android DownloadManager is unavailable", manager);
        removeFixtureDownloads(manager);

        long downloadedId = -1;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = (WebView) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
                webView.loadDataWithBaseURL(BrenUpUriPolicy.HOME_URL + "/android-test",
                        "<!doctype html><a id='download' download='" + FILE_NAME + "' href='" + PUBLIC_FILE +
                                "'>Download public BrenUp icon</a>", "text/html", "UTF-8",
                        BrenUpUriPolicy.HOME_URL + "/android-test");
            });
            assertTrue("Trusted test page did not load", waitForJavascript(scenario,
                    "document.getElementById('download')!==null", 10_000));
            assertTrue("WebView did not trigger the native download listener", "true".equals(
                    evaluateJavascript(scenario, "(function(){document.getElementById('download').click();return true;})()")));

            long deadline = SystemClock.uptimeMillis() + 30_000;
            while (SystemClock.uptimeMillis() < deadline) {
                downloadedId = findCompletedFixtureDownload(manager);
                if (downloadedId >= 0) break;
                SystemClock.sleep(250);
            }
            assertTrue("DownloadManager did not complete the public first-party icon download", downloadedId >= 0);
            ParcelFileDescriptor descriptor = manager.openDownloadedFile(downloadedId);
            assertNotNull("DownloadManager returned no file descriptor", descriptor);
            try (ParcelFileDescriptor ownedDescriptor = descriptor;
                 InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(ownedDescriptor)) {
                assertTrue("Downloaded icon was empty", input.read() >= 0);
            }
        } finally {
            if (downloadedId >= 0) manager.remove(downloadedId);
            else removeFixtureDownloads(manager);
        }
    }

    private static long findCompletedFixtureDownload(DownloadManager manager) {
        try (Cursor cursor = manager.query(new DownloadManager.Query())) {
            if (cursor == null) return -1;
            int titleColumn = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE);
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int idColumn = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
            if (titleColumn < 0 || statusColumn < 0 || idColumn < 0) return -1;
            while (cursor.moveToNext()) {
                if (FILE_NAME.equals(cursor.getString(titleColumn))
                        && cursor.getInt(statusColumn) == DownloadManager.STATUS_SUCCESSFUL) {
                    return cursor.getLong(idColumn);
                }
            }
        } catch (Exception ignored) { }
        return -1;
    }

    private static void removeFixtureDownloads(DownloadManager manager) {
        ArrayList<Long> ids = new ArrayList<>();
        try (Cursor cursor = manager.query(new DownloadManager.Query())) {
            if (cursor == null) return;
            int titleColumn = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE);
            int idColumn = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
            if (titleColumn < 0 || idColumn < 0) return;
            while (cursor.moveToNext()) {
                if (FILE_NAME.equals(cursor.getString(titleColumn))) ids.add(cursor.getLong(idColumn));
            }
        } catch (Exception ignored) { }
        for (Long id : ids) manager.remove(id);
    }

    private static boolean waitForJavascript(ActivityScenario<MainActivity> scenario, String script,
                                            long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            String value = evaluateJavascript(scenario, script);
            if ("true".equals(value)) return true;
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
}

package com.brenup.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.hardware.display.DisplayManager.DisplayListener;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.view.Display;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicReference;

/** Captures display frames only after the user grants Android MediaProjection consent. */
public class ScreenCaptureService extends Service {
    public static final String ACTION_START = "com.brenup.app.START_SCREEN_CAPTURE";
    public static final String ACTION_STOP = "com.brenup.app.STOP_SCREEN_CAPTURE";
    public static final String EXTRA_RESULT_CODE = "result_code";
    public static final String EXTRA_RESULT_DATA = "result_data";
    public static final String EXTRA_CAPTURE_TOKEN = "capture_token";
    public static final String EXTRA_CAPTURE_PURPOSE = "capture_purpose";
    private static final String CHANNEL_ID = "brenup_screen_capture";
    private static final int NOTIFICATION_ID = 4040;
    private static final AtomicReference<byte[]> CURRENT_FRAME = new AtomicReference<>();
    private static final long MIN_FRAME_INTERVAL_MS = 125;
    private static final AtomicReference<StopCompletion> STOP_COMPLETION = new AtomicReference<>();
    private static volatile String activeToken;
    private static volatile boolean active;

    public interface StopCompletion { void onComplete(boolean stopped); }

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private DisplayManager displayManager;
    private boolean localRecording;
    private long lastEncodedFrameAt;
    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() {
        @Override public void onStop() {
            stopCapture();
            stopSelf();
        }

        @Override public void onCapturedContentResize(int width, int height) {
            if (captureHandler != null) {
                captureHandler.post(() -> resizeCapture(width, height));
            }
        }
    };
    private final DisplayListener displayListener = new DisplayListener() {
        @Override public void onDisplayAdded(int displayId) { }
        @Override public void onDisplayRemoved(int displayId) { }
        @Override public void onDisplayChanged(int displayId) {
            if (displayId == Display.DEFAULT_DISPLAY && captureHandler != null) {
                captureHandler.post(ScreenCaptureService.this::resizeCaptureIfNeeded);
            }
        }
    };

    public static boolean isActive() { return active; }
    public static String getActiveToken() { return activeToken; }
    public static boolean isFrameReady(String token) {
        return active && token != null && token.equals(activeToken) && CURRENT_FRAME.get() != null;
    }
    public static byte[] getLatestFrame(String token) {
        if (!active || token == null || !token.equals(activeToken)) return null;
        return CURRENT_FRAME.get();
    }

    static byte[] copyRgbaRows(ByteBuffer source, int width, int height, int rowStride, int pixelStride) {
        if (source == null || width <= 0 || height <= 0 || pixelStride != 4) {
            throw new IllegalArgumentException("Invalid RGBA image plane");
        }
        int rowBytes = Math.multiplyExact(width, pixelStride);
        if (rowStride < rowBytes) throw new IllegalArgumentException("Image row is shorter than its pixels");
        int length = Math.multiplyExact(rowBytes, height);
        byte[] pixels = new byte[length];
        ByteBuffer rows = source.duplicate();
        int start = rows.position();
        for (int y = 0; y < height; y++) {
            int rowStart = Math.addExact(start, Math.multiplyExact(y, rowStride));
            if (rowStart < start || rows.limit() - rowStart < rowBytes) {
                throw new IllegalArgumentException("Image plane does not contain a complete pixel row");
            }
            rows.position(rowStart);
            rows.get(pixels, y * rowBytes, rowBytes);
        }
        return pixels;
    }

    public static boolean requestStop(Context context, StopCompletion completion) {
        if (!STOP_COMPLETION.compareAndSet(null, completion)) return false;
        try {
            Intent stopIntent = new Intent(context, ScreenCaptureService.class).setAction(ACTION_STOP);
            if (context.startService(stopIntent) == null) completeStop(false);
        } catch (Exception exception) {
            completeStop(false);
        }
        return true;
    }

    private static void completeStop(boolean stopped) {
        StopCompletion completion = STOP_COMPLETION.getAndSet(null);
        if (completion != null) completion.onComplete(stopped);
    }

    @Override public void onCreate() { super.onCreate(); createNotificationChannel(); }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopCapture();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (active) return START_NOT_STICKY;
        if (intent == null || intent.getParcelableExtra(EXTRA_RESULT_DATA) == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        localRecording = "record".equals(intent.getStringExtra(EXTRA_CAPTURE_PURPOSE));
        startForegroundCaptureNotification();
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        activeToken = intent.getStringExtra(EXTRA_CAPTURE_TOKEN);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null || activeToken == null) { stopCapture(); stopSelf(); return START_NOT_STICKY; }
        try {
            projection = manager.getMediaProjection(resultCode, resultData);
            DisplayMetrics metrics = readDisplayMetrics();
            int width = captureWidth(metrics);
            int height = captureHeight(metrics, width);
            int density = metrics.densityDpi;
            captureThread = new HandlerThread("BrenUpCapture");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());
            projection.registerCallback(projectionCallback, captureHandler);
            imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            imageReader.setOnImageAvailableListener(this::onImageAvailable, captureHandler);
            virtualDisplay = projection.createVirtualDisplay("BrenUpScreenCapture", width, height, density,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader.getSurface(), null, null);
            displayManager = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
            if (displayManager != null) displayManager.registerDisplayListener(displayListener, captureHandler);
            active = true;
        } catch (Exception exception) {
            stopCapture();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private DisplayMetrics readDisplayMetrics() {
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) throw new IllegalStateException("Display unavailable");
        windowManager.getDefaultDisplay().getRealMetrics(metrics);
        return metrics;
    }

    private int captureWidth(DisplayMetrics metrics) {
        return Math.max(1, Math.min(metrics.widthPixels, 1280));
    }

    private int captureHeight(DisplayMetrics metrics, int width) {
        return Math.max(1, (int) (width * (metrics.heightPixels / (float) Math.max(1, metrics.widthPixels))));
    }

    private void resizeCaptureIfNeeded() {
        if (!active || projection == null || virtualDisplay == null || imageReader == null) return;
        try {
            DisplayMetrics metrics = readDisplayMetrics();
            int width = captureWidth(metrics);
            int height = captureHeight(metrics, width);
            resizeCapture(width, height);
        } catch (Exception ignored) {
            // Keep the active projection alive; subsequent display changes can retry the resize.
        }
    }

    private void resizeCapture(int sourceWidth, int sourceHeight) {
        if (!active || projection == null || virtualDisplay == null || imageReader == null
                || sourceWidth <= 0 || sourceHeight <= 0) return;
        try {
            int width = Math.max(1, Math.min(sourceWidth, 1280));
            int height = Math.max(1, (int) (width * (sourceHeight / (float) sourceWidth)));
            if (imageReader.getWidth() == width && imageReader.getHeight() == height) return;

            DisplayMetrics metrics = readDisplayMetrics();
            ImageReader resizedReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            resizedReader.setOnImageAvailableListener(this::onImageAvailable, captureHandler);
            virtualDisplay.resize(width, height, metrics.densityDpi);
            virtualDisplay.setSurface(resizedReader.getSurface());
            ImageReader oldReader = imageReader;
            imageReader = resizedReader;
            oldReader.setOnImageAvailableListener(null, null);
            oldReader.close();
            CURRENT_FRAME.set(null);
        } catch (Exception ignored) {
            // Keep the active projection alive; a later display callback can retry the resize.
        }
    }

    private void onImageAvailable(ImageReader reader) {
        Image image = null;
        Bitmap frame = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) return;
            long now = SystemClock.elapsedRealtime();
            if (now - lastEncodedFrameAt < MIN_FRAME_INTERVAL_MS) return;
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int width = image.getWidth();
            int height = image.getHeight();
            byte[] pixels = copyRgbaRows(buffer, width, height, rowStride, pixelStride);
            frame = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            frame.copyPixelsFromBuffer(ByteBuffer.wrap(pixels));
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            frame.compress(Bitmap.CompressFormat.JPEG, 55, output);
            CURRENT_FRAME.set(output.toByteArray());
            lastEncodedFrameAt = now;
        } catch (Exception ignored) {
            // Frames are transient and never written to disk or logged.
        } finally {
            if (frame != null) frame.recycle();
            if (image != null) image.close();
        }
    }

    private void startForegroundCaptureNotification() {
        Intent stopIntent = new Intent(this, ScreenCaptureService.class).setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(
                this, NOTIFICATION_ID, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(localRecording ? "BrenUp Local Recording" : "BrenUp Live Classroom")
                .setContentText(localRecording
                        ? "Local screen recording is active in your live session"
                        : "Screen sharing is active in your live session")
                .setSmallIcon(R.drawable.ic_stat_brenup)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop capture", stopAction)
                .setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(NOTIFICATION_ID, notification);
    }

    private void stopCapture() {
        active = false;
        activeToken = null;
        CURRENT_FRAME.set(null);
        if (displayManager != null) { displayManager.unregisterDisplayListener(displayListener); displayManager = null; }
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { imageReader.close(); imageReader = null; }
        if (captureHandler != null) { captureHandler.removeCallbacksAndMessages(null); captureHandler = null; }
        if (captureThread != null) { captureThread.quitSafely(); captureThread = null; }
        if (projection != null) {
            MediaProjection stoppedProjection = projection;
            projection = null;
            stoppedProjection.stop();
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        completeStop(true);
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopCapture();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() { stopCapture(); super.onDestroy(); }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Live Class Capture", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows while BrenUp is sharing or recording your screen in a live class");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}

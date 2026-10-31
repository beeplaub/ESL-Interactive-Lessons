package com.brenup.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.net.http.SslError;
import android.view.ViewGroup;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.auth.AuthTabIntent;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Android shell for the first-party BrenUp web product. */
public class MainActivity extends AppCompatActivity {
    private static final String BRIDGE_OBJECT = "BrenUpAndroid";
    private static final String SCREEN_ASSET_HOST = "appassets.androidplatform.net";
    private static final String STATE_PENDING_GOOGLE_OAUTH_URL = "pending_google_oauth_url";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileChooser;
    private PermissionRequest pendingWebPermission;
    private AlertDialog webPermissionRationale;
    private AlertDialog screenCaptureRationale;
    private PendingCaptureCall pendingCaptureCall;
    private String pendingCapturePurpose = "share";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable captureStartupCheck;
    private PendingCaptureCall pendingPushPermissionCall;
    private WebViewAssetLoader assetLoader;
    private boolean pushTokenReceiverRegistered;
    private String pushTokenRefreshInFlight;
    private final ExecutorService fileSaveExecutor = Executors.newSingleThreadExecutor();
    private PendingFileSave pendingFileSave;
    private volatile FileSaveTransfer activeFileSave;
    private Uri pendingGoogleOAuthUrl;

    private final BroadcastReceiver pushTokenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            syncPendingPushToken();
        }
    };

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::onFileChooserResult);
    private final ActivityResultLauncher<String[]> webPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), this::onWebPermissionsResult);
    private final ActivityResultLauncher<String> notificationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), this::onNotificationPermissionResult);
    private final ActivityResultLauncher<Intent> screenCaptureLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::onScreenCaptureResult);
    private final ActivityResultLauncher<Intent> fileSaveLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::onFileSaveDestinationResult);
    private final ActivityResultLauncher<Intent> googleOAuthTabLauncher =
            AuthTabIntent.registerActivityResultLauncher(this, this::onGoogleOAuthTabResult);

    private static final class PendingCaptureCall {
        final String id;
        final JavaScriptReplyProxy replyProxy;

        PendingCaptureCall(String id, JavaScriptReplyProxy replyProxy) {
            this.id = id;
            this.replyProxy = replyProxy;
        }
    }

    private static final class PendingFileSave {
        final String id;
        final JavaScriptReplyProxy replyProxy;
        final String filename;
        final String mimeType;
        final long size;

        PendingFileSave(String id, JavaScriptReplyProxy replyProxy, String filename, String mimeType, long size) {
            this.id = id;
            this.replyProxy = replyProxy;
            this.filename = filename;
            this.mimeType = mimeType;
            this.size = size;
        }
    }

    private static final class FileSaveTransfer {
        final String transferId;
        final Uri destination;
        final OutputStream output;
        final long expectedBytes;
        long writtenBytes;

        FileSaveTransfer(String transferId, Uri destination, OutputStream output, long expectedBytes) {
            this.transferId = transferId;
            this.destination = destination;
            this.output = output;
            this.expectedBytes = expectedBytes;
        }
    }

    private static final int MAX_FILE_SAVE_BYTES = 500_000_000;
    private static final int MAX_FILE_SAVE_CHUNK_BYTES = 512_000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            String pendingUrl = savedInstanceState.getString(STATE_PENDING_GOOGLE_OAUTH_URL);
            if (pendingUrl != null) pendingGoogleOAuthUrl = Uri.parse(pendingUrl);
        }
        BrenUpMessagingService.ensureChannel(this);
        configureEdgeToEdge();
        configureScreenFrameAssetLoader();
        configureWebView();
        configureBackNavigation();
        Uri launchUri = getLaunchUri(getIntent());
        webView.loadUrl(BrenUpUriPolicy.resolveLaunchUrl(launchUri));
    }

    @Override
    protected void onStart() {
        super.onStart();
        ContextCompat.registerReceiver(this, pushTokenReceiver,
                new IntentFilter(BrenUpMessagingService.ACTION_TOKEN_REFRESHED), ContextCompat.RECEIVER_NOT_EXPORTED);
        pushTokenReceiverRegistered = true;
    }

    @Override
    protected void onStop() {
        if (pushTokenReceiverRegistered) {
            unregisterReceiver(pushTokenReceiver);
            pushTokenReceiverRegistered = false;
        }
        super.onStop();
    }

    @Nullable
    private Uri getLaunchUri(@Nullable Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data != null) return data;
        return BrenUpUriPolicy.fromNotificationHref(intent.getStringExtra("href"));
    }

    private void configureWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(android.graphics.Color.WHITE);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        ViewGroup contentRoot = findViewById(android.R.id.content);
        contentRoot.setBackgroundColor(android.graphics.Color.rgb(37, 39, 65));
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (view, windowInsets) -> {
            Insets safeInsets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safeInsets.left, safeInsets.top, safeInsets.right, safeInsets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        contentRoot.setClipToPadding(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " BrenUpAndroid");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new SecureBrenUpWebViewClient());
        webView.setWebChromeClient(new BrenUpWebChromeClient());
        webView.setDownloadListener(this::downloadFromTrustedPage);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                    webView,
                    BRIDGE_OBJECT,
                            BrenUpUriPolicy.TRUSTED_ORIGINS,
                    new WebViewCompat.WebMessageListener() {
                        @Override
                        public void onPostMessage(
                                @NonNull WebView view,
                                @NonNull WebMessageCompat message,
                                @NonNull Uri sourceOrigin,
                                boolean isMainFrame,
                                @NonNull JavaScriptReplyProxy replyProxy
                        ) {
                            if (!isMainFrame || !BrenUpUriPolicy.isTrustedBrenUpUri(sourceOrigin)) return;
                            handleNativeMessage(message.getData(), replyProxy);
                        }
                    }
            );
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        setContentView(webView);
        ViewCompat.requestApplyInsets(contentRoot);
    }

    private void configureScreenFrameAssetLoader() {
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/brenup-screen/", this::screenFrameResponse)
                .build();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) return;

        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
            @Nullable @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!SCREEN_ASSET_HOST.equals(uri.getHost())) return null;
                return assetLoader.shouldInterceptRequest(uri);
            }
        });
    }

    private void configureEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(android.graphics.Color.rgb(37, 39, 65));
        getWindow().setNavigationBarColor(android.graphics.Color.WHITE);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(true);
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    private void openExternalUri(Uri uri) {
        if (!BrenUpUriPolicy.isAllowedExternalUri(uri)) return;
        Uri redirectUri = BrenUpUriPolicy.googleOAuthRedirectUri(uri);
        if (redirectUri != null) {
            launchGoogleOAuthTab(uri, redirectUri);
            return;
        }
        openExternalBrowser(uri);
    }

    private void launchGoogleOAuthTab(Uri authorizationUri, Uri redirectUri) {
        pendingGoogleOAuthUrl = authorizationUri;
        try {
            new AuthTabIntent.Builder().build().launch(
                    googleOAuthTabLauncher,
                    authorizationUri,
                    redirectUri.getHost(),
                    redirectUri.getPath());
        } catch (ActivityNotFoundException | IllegalArgumentException error) {
            pendingGoogleOAuthUrl = null;
            openExternalBrowser(authorizationUri);
        }
    }

    private void onGoogleOAuthTabResult(AuthTabIntent.AuthResult result) {
        Uri authorizationUri = pendingGoogleOAuthUrl;
        pendingGoogleOAuthUrl = null;
        Uri resultUri = result.resultUri;
        if (result.resultCode == AuthTabIntent.RESULT_OK
                && BrenUpUriPolicy.isGoogleOAuthCallback(resultUri)) {
            if (webView != null) webView.loadUrl(resultUri.toString());
            return;
        }

        if (authorizationUri != null
                && (result.resultCode == AuthTabIntent.RESULT_UNKNOWN_CODE
                || result.resultCode == AuthTabIntent.RESULT_VERIFICATION_FAILED
                || result.resultCode == AuthTabIntent.RESULT_VERIFICATION_TIMED_OUT)) {
            openExternalBrowser(authorizationUri);
        }
    }

    private void openExternalBrowser(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // A missing external handler must not fall back into the privileged WebView.
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        if (pendingGoogleOAuthUrl != null) {
            outState.putString(STATE_PENDING_GOOGLE_OAUTH_URL, pendingGoogleOAuthUrl.toString());
        }
        super.onSaveInstanceState(outState);
    }

    private void startLocalFileSave(JSONObject request, String id, JavaScriptReplyProxy replyProxy) {
        String filename = request.optString("filename", "").trim()
                .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        String mimeType = request.optString("mimeType", "").trim().toLowerCase(java.util.Locale.ROOT);
        long size = request.optLong("size", -1);
        boolean supportedMimeType = "video/webm".equals(mimeType) || "video/mp4".equals(mimeType)
                || "image/png".equals(mimeType) || "application/zip".equals(mimeType);
        if (filename.isEmpty() || filename.length() > 200 || size <= 0 || size > MAX_FILE_SAVE_BYTES || !supportedMimeType) {
            sendBridgeResponse(replyProxy, id, null, "This recording cannot be saved.");
            return;
        }
        if (pendingFileSave != null || activeFileSave != null) {
            sendBridgeResponse(replyProxy, id, null, "Another file save is already in progress.");
            return;
        }
        pendingFileSave = new PendingFileSave(id, replyProxy, filename, mimeType, size);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mimeType)
                .putExtra(Intent.EXTRA_TITLE, filename);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADownload"));
        try {
            fileSaveLauncher.launch(intent);
        } catch (Exception error) {
            pendingFileSave = null;
            sendBridgeResponse(replyProxy, id, null, "Android's file picker is unavailable.");
        }
    }

    private void onFileSaveDestinationResult(ActivityResult result) {
        PendingFileSave pending = pendingFileSave;
        pendingFileSave = null;
        if (pending == null) return;
        if (result.getResultCode() != RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            try {
                JSONObject cancelled = new JSONObject();
                cancelled.put("saved", false);
                sendBridgeResponse(pending.replyProxy, pending.id, cancelled, null);
            } catch (Exception ignored) { }
            return;
        }
        Uri destination = result.getData().getData();
        try {
            OutputStream output = getContentResolver().openOutputStream(destination, "wt");
            if (output == null) throw new IllegalStateException("Could not open the selected file.");
            String transferId = UUID.randomUUID().toString();
            activeFileSave = new FileSaveTransfer(transferId, destination, output, pending.size);
            JSONObject started = new JSONObject();
            started.put("transferId", transferId);
            sendBridgeResponse(pending.replyProxy, pending.id, started, null);
        } catch (Exception error) {
            deleteDocumentQuietly(destination);
            sendBridgeResponse(pending.replyProxy, pending.id, null, "Could not open the selected file.");
        }
    }

    private void appendLocalFileChunk(JSONObject request, String id, JavaScriptReplyProxy replyProxy) {
        String transferId = request.optString("transferId", "");
        String encoded = request.optString("chunk", "");
        if (encoded.isEmpty() || encoded.length() > ((MAX_FILE_SAVE_CHUNK_BYTES + 2) / 3) * 4 + 8) {
            sendBridgeResponse(replyProxy, id, null, "The recording data chunk is invalid.");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            sendBridgeResponse(replyProxy, id, null, "The recording data chunk is invalid.");
            return;
        }
        if (bytes.length == 0 || bytes.length > MAX_FILE_SAVE_CHUNK_BYTES) {
            sendBridgeResponse(replyProxy, id, null, "The recording data chunk is invalid.");
            return;
        }
        final FileSaveTransfer transfer = activeFileSave;
        if (transfer == null || !transfer.transferId.equals(transferId)) {
            sendBridgeResponse(replyProxy, id, null, "The recording save session has expired.");
            return;
        }
        fileSaveExecutor.execute(() -> {
            try {
                synchronized (MainActivity.this) {
                    if (activeFileSave != transfer || transfer.writtenBytes + bytes.length > transfer.expectedBytes) {
                        throw new IllegalStateException("The recording data exceeded its expected size.");
                    }
                    transfer.output.write(bytes);
                    transfer.writtenBytes += bytes.length;
                }
                JSONObject result = new JSONObject();
                result.put("written", bytes.length);
                sendBridgeResponse(replyProxy, id, result, null);
            } catch (Exception error) {
                failFileSave(transfer);
                sendBridgeResponse(replyProxy, id, null, "Could not write the recording to the selected file.");
            }
        });
    }

    private void finishLocalFileSave(JSONObject request, String id, JavaScriptReplyProxy replyProxy) {
        String transferId = request.optString("transferId", "");
        FileSaveTransfer transfer = activeFileSave;
        if (transfer == null || !transfer.transferId.equals(transferId)) {
            sendBridgeResponse(replyProxy, id, null, "The recording save session has expired.");
            return;
        }
        fileSaveExecutor.execute(() -> {
            try {
                synchronized (MainActivity.this) {
                    if (activeFileSave != transfer || transfer.writtenBytes != transfer.expectedBytes) {
                        throw new IllegalStateException("The recording is incomplete.");
                    }
                    transfer.output.flush();
                    transfer.output.close();
                    activeFileSave = null;
                }
                JSONObject result = new JSONObject();
                result.put("saved", true);
                sendBridgeResponse(replyProxy, id, result, null);
            } catch (Exception error) {
                failFileSave(transfer);
                sendBridgeResponse(replyProxy, id, null, "The recording could not be saved completely.");
            }
        });
    }

    private void cancelLocalFileSave(JSONObject request, String id, JavaScriptReplyProxy replyProxy) {
        String transferId = request.optString("transferId", "");
        FileSaveTransfer transfer = activeFileSave;
        if (transfer != null && transfer.transferId.equals(transferId)) fileSaveExecutor.execute(() -> failFileSave(transfer));
        JSONObject result = new JSONObject();
        try { result.put("cancelled", true); } catch (Exception ignored) { }
        sendBridgeResponse(replyProxy, id, result, null);
    }

    private void failFileSave(FileSaveTransfer transfer) {
        synchronized (this) {
            if (activeFileSave != transfer) return;
            activeFileSave = null;
            try { transfer.output.close(); } catch (Exception ignored) { }
        }
        deleteDocumentQuietly(transfer.destination);
    }

    private void deleteDocumentQuietly(Uri document) {
        try { DocumentsContract.deleteDocument(getContentResolver(), document); } catch (Exception ignored) { }
    }

    private WebResourceResponse screenFrameResponse(String path) {
        String filename = path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
        if (!filename.endsWith(".jpg")) return null;
        String token = filename.substring(0, filename.length() - 4);
        byte[] frame = ScreenCaptureService.getLatestFrame(token);
        if (frame == null) {
            return new WebResourceResponse(
                    "text/plain",
                    "UTF-8",
                    503,
                    "Screen capture frame not ready",
                    screenFrameHeaders(),
                    new ByteArrayInputStream(new byte[0])
            );
        }
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store, no-cache, must-revalidate");
        headers.put("Pragma", "no-cache");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cross-Origin-Resource-Policy", "cross-origin");
        return new WebResourceResponse("image/jpeg", "binary", 200, "OK", headers, new ByteArrayInputStream(frame));
    }

    private Map<String, String> screenFrameHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cross-Origin-Resource-Policy", "cross-origin");
        return headers;
    }

    private void handleNativeMessage(String rawMessage, JavaScriptReplyProxy replyProxy) {
        try {
            JSONObject request = new JSONObject(rawMessage);
            String id = request.optString("id", "");
            String method = request.optString("method", "");
            if (id.trim().isEmpty()) return;

            switch (method) {
                case "getDeviceInfo":
                    JSONObject device = new JSONObject();
                    device.put("platform", "android");
                    device.put("osVersion", Build.VERSION.RELEASE);
                    device.put("apiLevel", Build.VERSION.SDK_INT);
                    device.put("model", Build.MODEL);
                    device.put("isNativeApp", true);
                    device.put("supportsMediaProjection", true);
                    sendBridgeResponse(replyProxy, id, device, null);
                    break;
                case "requestScreenCapturePermission":
                    if (pendingCaptureCall != null || captureStartupCheck != null) {
                        sendBridgeResponse(replyProxy, id, null, "A screen capture request is already in progress.");
                        break;
                    }
                    if (ScreenCaptureService.isActive()) {
                        String activeToken = ScreenCaptureService.getActiveToken();
                        if (activeToken == null) {
                            sendBridgeResponse(replyProxy, id, null, "Android's active screen capture is not ready. Stop it and try again.");
                            break;
                        }
                        PendingCaptureCall activeCall = new PendingCaptureCall(id, replyProxy);
                        awaitFirstCaptureFrame(activeCall, activeToken, SystemClock.elapsedRealtime() + 10_000);
                        break;
                    }
                    pendingCaptureCall = new PendingCaptureCall(id, replyProxy);
                    pendingCapturePurpose = "record".equals(request.optString("purpose", "share")) ? "record" : "share";
                    android.media.projection.MediaProjectionManager projectionManager =
                            (android.media.projection.MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                    if (projectionManager == null) {
                        pendingCaptureCall = null;
                        sendBridgeResponse(replyProxy, id, null, "Screen capture is unavailable on this device.");
                        break;
                    }
                    showScreenCaptureRationale(
                            pendingCaptureCall,
                            "record".equals(pendingCapturePurpose),
                            projectionManager);
                    break;
                case "stopScreenCapture":
                    boolean stopAccepted = ScreenCaptureService.requestStop(this, stopped -> {
                        if (!stopped) {
                            sendBridgeResponse(replyProxy, id, null, "Could not stop screen capture.");
                            return;
                        }
                        JSONObject stopResult = new JSONObject();
                        try {
                            stopResult.put("stopped", true);
                            sendBridgeResponse(replyProxy, id, stopResult, null);
                        } catch (Exception ignored) { }
                    });
                    if (!stopAccepted) {
                        sendBridgeResponse(replyProxy, id, null, "A screen capture stop is already in progress.");
                    }
                    break;
                case "isScreenSharing":
                    JSONObject sharing = new JSONObject();
                    sharing.put("isSharing", ScreenCaptureService.isActive());
                    sendBridgeResponse(replyProxy, id, sharing, null);
                    break;
                case "shareContent":
                    String title = request.optString("title", "Share from BrenUp").trim();
                    String text = request.optString("text", "").trim();
                    String sharedUrl = request.optString("url", "").trim();
                    Uri shareUri = sharedUrl.isEmpty() ? null : Uri.parse(sharedUrl);
                    if (title.length() > 120 || text.length() > 2000
                            || (!sharedUrl.isEmpty() && !BrenUpUriPolicy.isTrustedBrenUpUri(shareUri))) {
                        sendBridgeResponse(replyProxy, id, null, "This BrenUp item cannot be shared.");
                        break;
                    }
                    Intent sendIntent = new Intent(Intent.ACTION_SEND).setType("text/plain");
                    sendIntent.putExtra(Intent.EXTRA_TITLE, title.isEmpty() ? "Share from BrenUp" : title);
                    sendIntent.putExtra(Intent.EXTRA_TEXT, (text.isEmpty() ? "" : text + "\n") + sharedUrl);
                    try {
                        startActivity(Intent.createChooser(sendIntent, "Share with"));
                        JSONObject shared = new JSONObject();
                        shared.put("shared", true);
                        sendBridgeResponse(replyProxy, id, shared, null);
                    } catch (Exception error) {
                        sendBridgeResponse(replyProxy, id, null, "Android sharing is unavailable right now.");
                    }
                    break;
                case "getPushToken":
                    if (FirebaseApp.getApps(this).isEmpty()) {
                        sendBridgeResponse(replyProxy, id, null, "Android notifications are not configured for this app.");
                        break;
                    }
                    if (pendingPushPermissionCall != null) {
                        sendBridgeResponse(replyProxy, id, null, "A notification permission request is already in progress.");
                        break;
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        pendingPushPermissionCall = new PendingCaptureCall(id, replyProxy);
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
                    } else {
                        requestFirebasePushToken(id, replyProxy);
                    }
                    break;
                case "deletePushToken":
                    try {
                        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(task -> {
                            if (!task.isSuccessful()) {
                                sendBridgeResponse(replyProxy, id, null, "Could not disable Android notifications on this device.");
                                return;
                            }
                            JSONObject deleted = new JSONObject();
                            try { deleted.put("deleted", true); } catch (Exception ignored) { }
                            sendBridgeResponse(replyProxy, id, deleted, null);
                        });
                    } catch (Exception error) {
                        sendBridgeResponse(replyProxy, id, null, "Android notifications are not configured for this app.");
                    }
                    break;
                case "setPushRegistrationEnabled":
                    boolean enabled = request.optBoolean("enabled", false);
                    String registeredToken = request.optString("token", "");
                    BrenUpMessagingService.setRegistrationEnabled(this, enabled, registeredToken);
                    JSONObject registration = new JSONObject();
                    registration.put("enabled", enabled);
                    sendBridgeResponse(replyProxy, id, registration, null);
                    break;
                case "acknowledgePushTokenRefresh":
                    String refreshedToken = request.optString("token", "");
                    BrenUpMessagingService.clearPendingToken(this, refreshedToken);
                    boolean completedRefresh = refreshedToken.equals(pushTokenRefreshInFlight);
                    if (completedRefresh) pushTokenRefreshInFlight = null;
                    JSONObject acknowledged = new JSONObject();
                    acknowledged.put("acknowledged", true);
                    sendBridgeResponse(replyProxy, id, acknowledged, null);
                    if (completedRefresh && webView != null) webView.post(this::syncPendingPushToken);
                    break;
                case "rejectPushTokenRefresh":
                    BrenUpMessagingService.setRegistrationEnabled(this, false, null);
                    pushTokenRefreshInFlight = null;
                    JSONObject rejected = new JSONObject();
                    rejected.put("enabled", false);
                    sendBridgeResponse(replyProxy, id, rejected, null);
                    break;
                case "retryPushTokenRefresh":
                    if (request.optString("token", "").equals(pushTokenRefreshInFlight)) {
                        pushTokenRefreshInFlight = null;
                    }
                    JSONObject retry = new JSONObject();
                    retry.put("retrying", true);
                    sendBridgeResponse(replyProxy, id, retry, null);
                    break;
                case "startLocalFileSave":
                    startLocalFileSave(request, id, replyProxy);
                    break;
                case "appendLocalFileSaveChunk":
                    appendLocalFileChunk(request, id, replyProxy);
                    break;
                case "finishLocalFileSave":
                    finishLocalFileSave(request, id, replyProxy);
                    break;
                case "cancelLocalFileSave":
                    cancelLocalFileSave(request, id, replyProxy);
                    break;
                default:
                    sendBridgeResponse(replyProxy, id, null, "Unsupported BrenUp native operation.");
            }
        } catch (Exception error) {
            // Do not send internal exception details or request contents to the web page.
        }
    }

    private static String screenFrameUrl(String token) {
        return "https://" + SCREEN_ASSET_HOST + "/brenup-screen/" + token + ".jpg";
    }

    private void onScreenCaptureResult(ActivityResult result) {
        PendingCaptureCall pending = pendingCaptureCall;
        pendingCaptureCall = null;
        if (captureStartupCheck != null) {
            mainHandler.removeCallbacks(captureStartupCheck);
            captureStartupCheck = null;
        }
        String capturePurpose = pendingCapturePurpose;
        pendingCapturePurpose = "share";
        if (pending == null) return;

        try {
            if (result.getResultCode() != RESULT_OK || result.getData() == null) {
                JSONObject denied = new JSONObject();
                denied.put("granted", false);
                denied.put("message", "Screen capture permission was declined.");
                sendBridgeResponse(pending.replyProxy, pending.id, denied, null);
                return;
            }

            String token = UUID.randomUUID().toString().replace("-", "");
            Intent serviceIntent = new Intent(this, ScreenCaptureService.class)
                    .setAction(ScreenCaptureService.ACTION_START)
                    .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode())
                    .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.getData())
                    .putExtra(ScreenCaptureService.EXTRA_CAPTURE_TOKEN, token)
                    .putExtra(ScreenCaptureService.EXTRA_CAPTURE_PURPOSE, capturePurpose);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, serviceIntent);
            } else {
                startService(serviceIntent);
            }
            awaitFirstCaptureFrame(pending, token, SystemClock.elapsedRealtime() + 10_000);
        } catch (Exception error) {
            sendBridgeResponse(pending.replyProxy, pending.id, null, "Could not start screen capture.");
        }
    }

    private void awaitFirstCaptureFrame(PendingCaptureCall pending, String token, long deadline) {
        Runnable check = new Runnable() {
            @Override public void run() {
                if (isFinishing() || isDestroyed()) {
                    captureStartupCheck = null;
                    return;
                }
                if (ScreenCaptureService.isFrameReady(token)) {
                    captureStartupCheck = null;
                    JSONObject granted = new JSONObject();
                    try {
                        granted.put("granted", true);
                        granted.put("streamUrl", screenFrameUrl(token));
                        sendBridgeResponse(pending.replyProxy, pending.id, granted, null);
                    } catch (Exception error) {
                        sendBridgeResponse(pending.replyProxy, pending.id, null, "Android could not prepare the screen-sharing stream.");
                    }
                    return;
                }
                if (SystemClock.elapsedRealtime() >= deadline) {
                    captureStartupCheck = null;
                    stopService(new Intent(MainActivity.this, ScreenCaptureService.class));
                    sendBridgeResponse(pending.replyProxy, pending.id, null,
                            "Android approved screen capture but did not deliver a frame. Close other screen-recording apps and try again.");
                    return;
                }
                mainHandler.postDelayed(this, 100);
            }
        };
        captureStartupCheck = check;
        mainHandler.post(check);
    }

    private void showScreenCaptureRationale(
            PendingCaptureCall pending,
            boolean localRecording,
            android.media.projection.MediaProjectionManager projectionManager
    ) {
        int message = localRecording
                ? R.string.screen_capture_rationale_recording
                : R.string.screen_capture_rationale_sharing;
        try {
            screenCaptureRationale = new AlertDialog.Builder(this)
                    .setTitle(R.string.screen_capture_rationale_title)
                    .setMessage(message)
                    .setPositiveButton(R.string.permission_rationale_continue, (dialog, which) -> {
                        screenCaptureRationale = null;
                        if (pendingCaptureCall != pending) return;
                        try {
                            screenCaptureLauncher.launch(projectionManager.createScreenCaptureIntent());
                        } catch (Exception error) {
                            pendingCaptureCall = null;
                            sendBridgeResponse(pending.replyProxy, pending.id, null, "Screen capture is unavailable on this device.");
                        }
                    })
                    .setNegativeButton(R.string.permission_rationale_cancel, (dialog, which) -> {
                        screenCaptureRationale = null;
                        if (pendingCaptureCall != pending) return;
                        pendingCaptureCall = null;
                        JSONObject denied = new JSONObject();
                        try {
                            denied.put("granted", false);
                            denied.put("message", "Screen capture was not started.");
                        } catch (Exception ignored) { }
                        sendBridgeResponse(pending.replyProxy, pending.id, denied, null);
                    })
                    .setCancelable(false)
                    .create();
            screenCaptureRationale.show();
        } catch (Exception error) {
            screenCaptureRationale = null;
            if (pendingCaptureCall == pending) {
                pendingCaptureCall = null;
                sendBridgeResponse(pending.replyProxy, pending.id, null, "Screen capture is unavailable on this device.");
            }
        }
    }

    private void sendBridgeResponse(JavaScriptReplyProxy replyProxy, String id, @Nullable JSONObject value, @Nullable String error) {
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
            JSONObject response = new JSONObject();
            response.put("id", id);
            if (error == null) response.put("value", value == null ? JSONObject.NULL : value);
            else response.put("error", error);
            runOnUiThread(() -> replyProxy.postMessage(response.toString()));
        } catch (Exception ignored) {
            // A closed WebView cannot receive a response; no personal data is logged.
        }
    }

    private void onFileChooserResult(ActivityResult result) {
        ValueCallback<Uri[]> callback = pendingFileChooser;
        pendingFileChooser = null;
        if (callback == null) return;
        Uri[] resultUris = null;
        if (result.getResultCode() == RESULT_OK && result.getData() != null) {
            Intent data = result.getData();
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                resultUris = new Uri[count];
                for (int i = 0; i < count; i++) resultUris[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                resultUris = new Uri[]{data.getData()};
            }
        }
        callback.onReceiveValue(resultUris);
    }

    private void onWebPermissionsResult(Map<String, Boolean> results) {
        PermissionRequest request = pendingWebPermission;
        pendingWebPermission = null;
        if (request == null) return;
        ArrayList<String> approvedResources = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = permissionForWebResource(resource);
            if (permission != null && (Boolean.TRUE.equals(results.get(permission))
                    || ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED)) {
                approvedResources.add(resource);
            }
        }
        if (approvedResources.isEmpty()) request.deny();
        else request.grant(approvedResources.toArray(new String[0]));
    }

    private void showWebPermissionRationale(PermissionRequest request) {
        StringBuilder message = new StringBuilder();
        for (String resource : request.getResources()) {
            String permission = permissionForWebResource(resource);
            if (permission == null
                    || ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) continue;
            if (message.length() > 0) message.append("\n\n");
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                message.append(getString(R.string.permission_rationale_microphone));
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                message.append(getString(R.string.permission_rationale_camera));
            }
        }
        if (message.length() == 0) {
            pendingWebPermission = null;
            request.deny();
            return;
        }

        webPermissionRationale = new AlertDialog.Builder(this)
                .setTitle(R.string.permission_rationale_title)
                .setMessage(message.toString())
                .setPositiveButton(R.string.permission_rationale_continue, (dialog, which) -> {
                    webPermissionRationale = null;
                    if (pendingWebPermission != request) return;
                    try {
                        String[] permissions = requestedAndroidPermissions(request);
                        if (permissions.length == 0) {
                            pendingWebPermission = null;
                            grantAlreadyGrantedWebPermissions(request);
                        } else {
                            webPermissionLauncher.launch(permissions);
                        }
                    } catch (Exception error) {
                        pendingWebPermission = null;
                        request.deny();
                    }
                })
                .setNegativeButton(R.string.permission_rationale_cancel, (dialog, which) -> {
                    webPermissionRationale = null;
                    if (pendingWebPermission == request) pendingWebPermission = null;
                    request.deny();
                })
                .setCancelable(false)
                .create();
        webPermissionRationale.show();
    }

    private String[] requestedAndroidPermissions(PermissionRequest request) {
        HashSet<String> needed = new HashSet<>();
        for (String resource : request.getResources()) {
            String permission = permissionForWebResource(resource);
            if (permission != null
                    && ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                needed.add(permission);
            }
        }
        return needed.toArray(new String[0]);
    }

    private void grantAlreadyGrantedWebPermissions(PermissionRequest request) {
        ArrayList<String> grantedResources = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = permissionForWebResource(resource);
            if (permission != null
                    && ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
                grantedResources.add(resource);
            }
        }
        if (grantedResources.isEmpty()) request.deny();
        else request.grant(grantedResources.toArray(new String[0]));
    }

    private void onNotificationPermissionResult(boolean granted) {
        PendingCaptureCall pending = pendingPushPermissionCall;
        pendingPushPermissionCall = null;
        if (pending == null) return;
        if (!granted) {
            sendBridgeResponse(pending.replyProxy, pending.id, null, "Notification permission was declined.");
            return;
        }
        requestFirebasePushToken(pending.id, pending.replyProxy);
    }

    private void requestFirebasePushToken(String id, JavaScriptReplyProxy replyProxy) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null || task.getResult().trim().isEmpty()) {
                    sendBridgeResponse(replyProxy, id, null, "Android notifications are not configured for this app.");
                    return;
                }
                JSONObject result = new JSONObject();
                try { result.put("token", task.getResult()); }
                catch (Exception ignored) {
                    sendBridgeResponse(replyProxy, id, null, "Could not read this device's notification token.");
                    return;
                }
                sendBridgeResponse(replyProxy, id, result, null);
            });
        } catch (Exception error) {
            sendBridgeResponse(replyProxy, id, null, "Android notifications are not configured for this app.");
        }
    }

    private void syncPendingPushToken() {
        if (webView == null || webView.getUrl() == null
                || !BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse(webView.getUrl()))) return;
        String token = BrenUpMessagingService.getPendingToken(this);
        if (token == null || pushTokenRefreshInFlight != null) return;
        String previousToken = BrenUpMessagingService.getPendingPreviousToken(this);
        if (previousToken == null) return;
        pushTokenRefreshInFlight = token;
        String quotedToken = JSONObject.quote(token);
        String quotedPreviousToken = JSONObject.quote(previousToken);
        String requestId = JSONObject.quote("token-refresh-" + UUID.randomUUID());
        String script = "(function(){const token=" + quotedToken + ";const previousToken=" + quotedPreviousToken + ";function post(method){window.BrenUpAndroid.postMessage(JSON.stringify({id:" + requestId + ",method:method,token:token}));}fetch('/api/push/devices',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'refresh',token:token,previousToken:previousToken,platform:'ANDROID'})}).then(function(response){if(response.status===409){window.dispatchEvent(new Event('brenup-push-registration-required'));post('rejectPushTokenRefresh');return;}if(!response.ok){post('retryPushTokenRefresh');return;}localStorage.setItem('brenup_push_token',token);window.dispatchEvent(new Event('brenup-push-token-refreshed'));post('acknowledgePushTokenRefresh');}).catch(function(){post('retryPushTokenRefresh');});})();";
        webView.evaluateJavascript(script, null);
    }

    @Nullable
    private String permissionForWebResource(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        return null;
    }

    private void downloadFromTrustedPage(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
        Uri uri = Uri.parse(url);
        if (!BrenUpUriPolicy.isAllowedDownloadUri(uri)) return;
        try {
            DownloadManager.Request request = new DownloadManager.Request(uri);
            String filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                    .replaceAll("[\\\\/:*?\"<>|]", "_");
            if (filename.isEmpty() || ".".equals(filename) || "..".equals(filename)) filename = "brenup-download";
            request.setTitle(filename);
            if (mimetype != null && !mimetype.trim().isEmpty()) request.setMimeType(mimetype);
            request.setDescription("Downloading from BrenUp");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            if (userAgent != null && !userAgent.isEmpty()) request.addRequestHeader("User-Agent", userAgent);
            if ("www.brenup.com".equalsIgnoreCase(uri.getHost()) || "brenup.com".equalsIgnoreCase(uri.getHost())) {
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
            }
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager != null) manager.enqueue(request);
        } catch (Exception ignored) {
            // Download failures are surfaced by Android's notification/download UI.
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = getLaunchUri(intent);
        if (webView != null && BrenUpUriPolicy.isInternalLaunchUri(uri)) {
            webView.loadUrl(BrenUpUriPolicy.resolveLaunchUrl(uri));
        }
    }

    @Override
    protected void onDestroy() {
        pushTokenRefreshInFlight = null;
        if (pendingFileSave != null) {
            sendBridgeResponse(pendingFileSave.replyProxy, pendingFileSave.id, null, "The save was interrupted.");
            pendingFileSave = null;
        }
        FileSaveTransfer fileSave = activeFileSave;
        if (fileSave != null) fileSaveExecutor.execute(() -> failFileSave(fileSave));
        fileSaveExecutor.shutdown();
        if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
        pendingFileChooser = null;
        if (webPermissionRationale != null) webPermissionRationale.dismiss();
        webPermissionRationale = null;
        if (screenCaptureRationale != null) screenCaptureRationale.dismiss();
        screenCaptureRationale = null;
        pendingCaptureCall = null;
        if (captureStartupCheck != null) {
            mainHandler.removeCallbacks(captureStartupCheck);
            captureStartupCheck = null;
        }
        pendingCapturePurpose = "share";
        pendingWebPermission = null;
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private final class SecureBrenUpWebViewClient extends WebViewClient {
        @RequiresApi(Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            if (webView != view) return true;
            Uri retryUri = Uri.parse(view.getUrl() == null ? BrenUpUriPolicy.HOME_URL : view.getUrl());

            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            view.stopLoading();
            view.setWebChromeClient(null);
            view.setWebViewClient(null);
            view.destroy();
            webView = null;

            stopService(new Intent(MainActivity.this, ScreenCaptureService.class));
            configureWebView();
            showOfflineScreen(retryUri);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (BrenUpUriPolicy.isTrustedBrenUpUri(uri)) return false;
            if ("about:blank".equalsIgnoreCase(uri.toString())) return false;
            openExternalUri(uri);
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (SCREEN_ASSET_HOST.equals(uri.getHost())) {
                WebResourceResponse local = assetLoader.shouldInterceptRequest(uri);
                if (local != null) return local;
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOfflineScreen(request.getUrl());
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 500) showOfflineScreen(request.getUrl());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse(url))) syncPendingPushToken();
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showOfflineScreen(Uri.parse(error.getUrl()));
        }
    }

    private final class BrenUpWebChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            if (!BrenUpUriPolicy.isTrustedBrenUpOrigin(request.getOrigin())) {
                request.deny();
                return;
            }
            if (pendingWebPermission != null) {
                request.deny();
                return;
            }
            HashSet<String> needed = new HashSet<>();
            ArrayList<String> alreadyGrantedResources = new ArrayList<>();
            for (String resource : request.getResources()) {
                String permission = permissionForWebResource(resource);
                if (permission == null) continue;
                if (ContextCompat.checkSelfPermission(MainActivity.this, permission) == PackageManager.PERMISSION_GRANTED) {
                    alreadyGrantedResources.add(resource);
                } else {
                    needed.add(permission);
                }
            }
            if (needed.isEmpty()) {
                if (alreadyGrantedResources.isEmpty()) request.deny();
                else request.grant(alreadyGrantedResources.toArray(new String[0]));
            } else {
                pendingWebPermission = request;
                showWebPermissionRationale(request);
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingWebPermission == request) {
                pendingWebPermission = null;
                if (webPermissionRationale != null) {
                    webPermissionRationale.dismiss();
                    webPermissionRationale = null;
                }
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
            if (!BrenUpUriPolicy.isTrustedBrenUpUri(Uri.parse(view.getUrl()))) {
                filePathCallback.onReceiveValue(null);
                return true;
            }
            if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
            pendingFileChooser = filePathCallback;
            try {
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                fileChooserLauncher.launch(intent);
                return true;
            } catch (Exception ignored) {
                pendingFileChooser = null;
                filePathCallback.onReceiveValue(null);
                return true;
            }
        }
    }

    private void showOfflineScreen(@Nullable Uri retryUri) {
        if (webView == null) return;
        String retryUrl = escapeHtmlAttribute(BrenUpUriPolicy.resolveOfflineRetryUrl(retryUri));
        String html = "<!doctype html><html><meta name='viewport' content='width=device-width, initial-scale=1'><style>body{font:16px system-ui,sans-serif;background:#f8f7fb;color:#202033;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px;text-align:center}main{max-width:420px}a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:10px;background:#ff765e;color:white;text-decoration:none;font-weight:700}</style><main><h1>BrenUp is offline</h1><p>Check your connection, then try again. Your account session is kept on this device.</p><a href='" + retryUrl + "'>Try again</a></main></html>";
        runOnUiThread(() -> webView.loadDataWithBaseURL("https://appassets.androidplatform.net/offline/", html, "text/html", "UTF-8", null));
    }

    private String escapeHtmlAttribute(String value) {
        return value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

}

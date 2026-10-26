package com.brenup.app;

import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BrenUpNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Configure system back navigation to navigate browser history or exit gracefully
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        // Enhance WebView permissions for WebRTC audio/video and responsive layout
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    // Auto-grant WebRTC media resources within the trusted first-party domain
                    runOnUiThread(() -> {
                        String origin = request.getOrigin().toString();
                        if (origin.contains("brenup.com") || origin.contains("localhost")) {
                            request.grant(request.getResources());
                        } else {
                            request.deny();
                        }
                    });
                }
            });
        }
    }
}

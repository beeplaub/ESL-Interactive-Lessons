package com.brenup.app;

import android.net.Uri;
import androidx.annotation.Nullable;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Central allowlist for URLs that may enter the WebView or use native integrations. */
final class BrenUpUriPolicy {
    static final String HOME_URL = "https://www.brenup.com";
    static final Set<String> TRUSTED_ORIGINS = trustedOrigins();

    private BrenUpUriPolicy() { }

    private static Set<String> trustedOrigins() {
        Set<String> origins = new HashSet<>();
        origins.add("https://www.brenup.com");
        origins.add("https://brenup.com");
        return Collections.unmodifiableSet(origins);
    }

    static boolean isTrustedBrenUpUri(@Nullable Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) return false;
        if (uri.getPort() != -1 && uri.getPort() != 443) return false;
        String host = uri.getHost();
        return host != null && ("www.brenup.com".equalsIgnoreCase(host) || "brenup.com".equalsIgnoreCase(host));
    }

    static boolean isTrustedBrenUpOrigin(@Nullable Uri origin) {
        return origin != null
                && (origin.getPath() == null || origin.getPath().isEmpty() || "/".equals(origin.getPath()))
                && origin.getQuery() == null
                && origin.getFragment() == null
                && isTrustedBrenUpUri(origin);
    }

    static boolean isBrenUpAuthCallback(@Nullable Uri uri) {
        return uri != null
                && "com.brenup.app".equalsIgnoreCase(uri.getScheme())
                && "auth".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null
                && uri.getPort() == -1
                && ("/callback".equals(uri.getPath()) || "/reset-password".equals(uri.getPath()));
    }

    static boolean isInternalLaunchUri(@Nullable Uri uri) {
        return isTrustedBrenUpUri(uri) || isBrenUpAuthCallback(uri);
    }

    static String resolveLaunchUrl(@Nullable Uri uri) {
        if (isTrustedBrenUpUri(uri)) return uri.toString();
        if (isBrenUpAuthCallback(uri)) {
            String path = "/reset-password".equals(uri.getPath()) ? "/auth/reset-password" : "/auth/callback";
            Uri.Builder callback = Uri.parse(HOME_URL + path).buildUpon();
            String code = uri.getQueryParameter("code");
            String error = uri.getQueryParameter("error");
            if ((code != null && !code.trim().isEmpty()) || (error != null && !error.trim().isEmpty())) {
                if (code != null && !code.trim().isEmpty()) callback.appendQueryParameter("code", code);
                if (error != null && !error.trim().isEmpty()) callback.appendQueryParameter("error", error);
                String errorDescription = uri.getQueryParameter("error_description");
                if (errorDescription != null) callback.appendQueryParameter("error_description", errorDescription);
                String next = uri.getQueryParameter("next");
                if (next != null && next.startsWith("/") && !next.startsWith("//") && !next.contains("\\")) {
                    callback.appendQueryParameter("next", next);
                }
                return callback.build().toString();
            }
        }
        return HOME_URL;
    }

    static String resolveOfflineRetryUrl(@Nullable Uri uri) {
        return isTrustedBrenUpUri(uri) ? uri.toString() : HOME_URL;
    }

    static boolean isAllowedDownloadUri(@Nullable Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) return false;
        if (uri.getPort() != -1 && uri.getPort() != 443) return false;
        String host = uri.getHost();
        return host != null && ("www.brenup.com".equalsIgnoreCase(host)
                || "brenup.com".equalsIgnoreCase(host)
                || "media.brenup.com".equalsIgnoreCase(host));
    }

    static boolean isAllowedExternalUri(@Nullable Uri uri) {
        if (uri == null) return false;
        return isAllowedExternalUri(uri.getScheme(), uri.getHost(), uri.getUserInfo(), uri.getSchemeSpecificPart());
    }

    @Nullable
    static Uri googleOAuthRedirectUri(@Nullable Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) return null;
        String host = uri.getHost();
        if (host == null || !host.toLowerCase(java.util.Locale.ROOT).endsWith(".supabase.co")) return null;
        if (!"/auth/v1/authorize".equals(uri.getPath())
                || !"google".equalsIgnoreCase(uri.getQueryParameter("provider"))) return null;

        String redirectTo = uri.getQueryParameter("redirect_to");
        if (redirectTo == null) return null;
        Uri redirectUri = Uri.parse(redirectTo);
        if (!isTrustedBrenUpUri(redirectUri) || !"/auth/android-callback".equals(redirectUri.getPath())) return null;
        return redirectUri;
    }

    static boolean isGoogleOAuthCallback(@Nullable Uri uri) {
        return isTrustedBrenUpUri(uri) && "/auth/android-callback".equals(uri.getPath());
    }

    static boolean isAllowedExternalUri(
            @Nullable String scheme,
            @Nullable String host,
            @Nullable String userInfo,
            @Nullable String schemeSpecificPart
    ) {
        if (scheme == null || userInfo != null) return false;
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return host != null && !host.trim().isEmpty();
        }
        return "mailto".equalsIgnoreCase(scheme)
                && schemeSpecificPart != null
                && !schemeSpecificPart.trim().isEmpty();
    }

    @Nullable
    static Uri fromNotificationHref(@Nullable String rawHref) {
        if (rawHref == null || rawHref.trim().isEmpty()) return null;
        String value = rawHref.trim();
        if (value.startsWith("/") && !value.startsWith("//") && !value.contains("\\")) {
            value = "https://www.brenup.com" + value;
        }
        Uri uri = Uri.parse(value);
        return isTrustedBrenUpUri(uri) ? uri : null;
    }
}

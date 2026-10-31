package com.brenup.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Displays foreground BrenUp FCM messages and routes taps only to first-party pages. */
public class BrenUpMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "brenup_updates";
    static final String PREFERENCES = "brenup_native_push";
    static final String KEY_REGISTRATION_ENABLED = "registration_enabled";
    static final String KEY_REGISTERED_TOKEN = "registered_token";
    static final String KEY_PENDING_TOKEN = "pending_token";
    static final String KEY_PENDING_PREVIOUS_TOKEN = "pending_previous_token";
    public static final String ACTION_TOKEN_REFRESHED = "com.brenup.app.PUSH_TOKEN_REFRESHED";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        SharedPreferences preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        String previousToken = preferences.getString(KEY_REGISTERED_TOKEN, null);
        if (!preferences.getBoolean(KEY_REGISTRATION_ENABLED, false)
                || previousToken == null || previousToken.trim().isEmpty()) return;
        preferences.edit()
                .putString(KEY_PENDING_TOKEN, token)
                .putString(KEY_PENDING_PREVIOUS_TOKEN, previousToken)
                .apply();
        sendBroadcast(new Intent(ACTION_TOKEN_REFRESHED).setPackage(getPackageName()));
    }

    @Nullable
    public static String getPendingToken(Context context) {
        String token = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(KEY_PENDING_TOKEN, null);
        return token == null || token.trim().isEmpty() ? null : token;
    }

    @Nullable
    public static String getPendingPreviousToken(Context context) {
        String token = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(KEY_PENDING_PREVIOUS_TOKEN, null);
        return token == null || token.trim().isEmpty() ? null : token;
    }

    public static void setRegistrationEnabled(Context context, boolean enabled, @Nullable String token) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_REGISTRATION_ENABLED, enabled);
        if (enabled && token != null && !token.trim().isEmpty()) {
            editor.putString(KEY_REGISTERED_TOKEN, token);
        } else if (!enabled) {
            editor.remove(KEY_REGISTERED_TOKEN)
                    .remove(KEY_PENDING_TOKEN)
                    .remove(KEY_PENDING_PREVIOUS_TOKEN);
        }
        editor.apply();
    }

    public static void clearPendingToken(Context context, String token) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        if (token == null || token.trim().isEmpty()) return;
        String pendingToken = preferences.getString(KEY_PENDING_TOKEN, null);
        String registeredToken = preferences.getString(KEY_REGISTERED_TOKEN, null);
        String pendingPreviousToken = preferences.getString(KEY_PENDING_PREVIOUS_TOKEN, null);
        SharedPreferences.Editor editor = preferences.edit().putString(KEY_REGISTERED_TOKEN, token);
        if (token.equals(pendingToken)) {
            editor.remove(KEY_PENDING_TOKEN).remove(KEY_PENDING_PREVIOUS_TOKEN);
        } else if (pendingToken != null && registeredToken != null
                && registeredToken.equals(pendingPreviousToken)) {
            // Another FCM rotation arrived while this update was in flight. Rebase
            // the queued update on the token the server has just accepted.
            editor.putString(KEY_PENDING_PREVIOUS_TOKEN, token);
        }
        editor.apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        RemoteMessage.Notification notification = message.getNotification();
        Map<String, String> data = message.getData();
        String title = notification != null && notification.getTitle() != null
                ? notification.getTitle() : data.getOrDefault("title", "BrenUp");
        String body = notification != null && notification.getBody() != null
                ? notification.getBody() : data.getOrDefault("body", "You have an update in BrenUp.");
        Uri target = BrenUpUriPolicy.fromNotificationHref(data.get("href"));
        if (target == null) target = Uri.parse("https://www.brenup.com/account");

        Intent openApp = new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(target)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                target.toString().hashCode(),
                openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        ensureChannel(this);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_brenup)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "BrenUp updates", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Class, assignment, and learning updates from BrenUp");
        manager.createNotificationChannel(channel);
    }
}

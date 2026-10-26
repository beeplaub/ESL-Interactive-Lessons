package com.brenup.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BrenUpNative")
public class BrenUpNativePlugin extends Plugin {
    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private boolean isSharing = false;

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("osVersion", Build.VERSION.RELEASE);
        ret.put("apiLevel", Build.VERSION.SDK_INT);
        ret.put("model", Build.MODEL);
        ret.put("isNativeApp", true);
        ret.put("supportsMediaProjection", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestScreenCapturePermission(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        projectionManager = (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (projectionManager == null) {
            call.reject("MediaProjectionManager unavailable on this device");
            return;
        }

        Intent captureIntent = projectionManager.createScreenCaptureIntent();
        startActivityForResult(call, captureIntent, "handleScreenCaptureResult");
    }

    @ActivityCallback
    private void handleScreenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Activity activity = getActivity();
            if (activity != null) {
                // Start the mandatory foreground service
                Intent serviceIntent = new Intent(activity, ScreenCaptureService.class);
                serviceIntent.setAction(ScreenCaptureService.ACTION_START);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    activity.startForegroundService(serviceIntent);
                } else {
                    activity.startService(serviceIntent);
                }
            }

            isSharing = true;
            JSObject res = new JSObject();
            res.put("granted", true);
            res.put("message", "Screen capture consent granted by user");
            call.resolve(res);
        } else {
            isSharing = false;
            JSObject res = new JSObject();
            res.put("granted", false);
            res.put("message", "User declined screen capture permission");
            call.resolve(res);
        }
    }

    @PluginMethod
    public void stopScreenCapture(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            Intent serviceIntent = new Intent(activity, ScreenCaptureService.class);
            serviceIntent.setAction(ScreenCaptureService.ACTION_STOP);
            activity.startService(serviceIntent);
        }

        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        isSharing = false;

        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    @PluginMethod
    public void isScreenSharing(PluginCall call) {
        JSObject res = new JSObject();
        res.put("isSharing", isSharing);
        call.resolve(res);
    }
}

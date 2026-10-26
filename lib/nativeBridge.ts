/**
 * Typed client interface to communicate with the Android BrenUp native shell
 * when running inside the Capacitor Android app container.
 */

export interface DeviceInfo {
  platform: 'android' | 'web';
  osVersion?: string;
  apiLevel?: number;
  model?: string;
  isNativeApp: boolean;
  supportsMediaProjection?: boolean;
}

export interface ScreenCaptureResult {
  granted: boolean;
  message?: string;
}

interface BrenUpNativePluginInterface {
  getDeviceInfo(): Promise<DeviceInfo>;
  requestScreenCapturePermission(): Promise<ScreenCaptureResult>;
  stopScreenCapture(): Promise<{ stopped: boolean }>;
  isScreenSharing(): Promise<{ isSharing: boolean }>;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        BrenUpNative?: BrenUpNativePluginInterface;
      };
    };
  }
}

export function isBrenUpNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.Plugins?.BrenUpNative
  );
}

export async function getNativeDeviceInfo(): Promise<DeviceInfo> {
  if (!isBrenUpNativeApp() || !window.Capacitor?.Plugins?.BrenUpNative) {
    return {
      platform: 'web',
      isNativeApp: false,
    };
  }
  try {
    return await window.Capacitor.Plugins.BrenUpNative.getDeviceInfo();
  } catch (error) {
    console.warn('Failed to get native device info:', error);
    return {
      platform: 'android',
      isNativeApp: true,
    };
  }
}

export async function requestNativeScreenCapture(): Promise<ScreenCaptureResult> {
  if (!isBrenUpNativeApp() || !window.Capacitor?.Plugins?.BrenUpNative) {
    return {
      granted: false,
      message: 'Native screen capture is only available within the Android app.',
    };
  }
  return window.Capacitor.Plugins.BrenUpNative.requestScreenCapturePermission();
}

export async function stopNativeScreenCapture(): Promise<void> {
  if (!isBrenUpNativeApp() || !window.Capacitor?.Plugins?.BrenUpNative) {
    return;
  }
  await window.Capacitor.Plugins.BrenUpNative.stopScreenCapture();
}

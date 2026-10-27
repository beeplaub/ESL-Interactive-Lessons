/** Typed request/reply bridge exposed by the first party Android WebView. */
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
  streamUrl?: string;
}

type NativeValue = DeviceInfo | ScreenCaptureResult | { stopped: boolean } | { isSharing: boolean } | { shared: boolean } | { token: string } | { deleted: boolean } | { enabled: boolean } | { acknowledged: boolean } | { transferId: string } | { written: number } | { saved: boolean } | { cancelled: boolean };
interface PendingRequest { resolve: (value: NativeValue) => void; reject: (reason: Error) => void; timer?: ReturnType<typeof setTimeout> }
interface BrenUpAndroidBridge {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
}

declare global { interface Window { BrenUpAndroid?: BrenUpAndroidBridge } }

const pending = new Map<string, PendingRequest>();
let isListeningForReplies = false;

function removeReplyListenerWhenIdle() {
  if (pending.size !== 0 || !isListeningForReplies || typeof window === 'undefined') return;
  window.BrenUpAndroid?.removeEventListener('message', receiveNativeMessage);
  isListeningForReplies = false;
}

function receiveNativeMessage(event: MessageEvent<string>) {
  try {
    const response = JSON.parse(event.data) as { id?: string; value?: NativeValue; error?: string };
    if (!response.id) return;
    const request = pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error));
    else if (response.value !== undefined) request.resolve(response.value);
    else request.reject(new Error('Android returned an empty response.'));
    removeReplyListenerWhenIdle();
  } catch { /* Ignore malformed messages; request timeout reports failure. */ }
}

function requestNative<T extends NativeValue>(method: string, payload?: Record<string, string>, timeoutMs = 30_000): Promise<T> {
  const bridge = typeof window === 'undefined' ? undefined : window.BrenUpAndroid;
  if (!bridge) return Promise.reject(new Error('Android app bridge is unavailable.'));
  if (!isListeningForReplies) {
    bridge.addEventListener('message', receiveNativeMessage);
    isListeningForReplies = true;
  }
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = timeoutMs > 0 ? setTimeout(() => {
      pending.delete(id);
      removeReplyListenerWhenIdle();
      reject(new Error('Android app did not respond. Please try again.'));
    }, timeoutMs) : undefined;
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    try { bridge.postMessage(JSON.stringify({ ...payload, id, method })); }
    catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      removeReplyListenerWhenIdle();
      reject(error instanceof Error ? error : new Error('Could not contact the Android app.'));
    }
  });
}

export function isBrenUpNativeApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.BrenUpAndroid);
}

/** Identify the Android shell separately from bridge availability.
 * OAuth leaves the WebView for Chrome, so native callback URLs must not
 * depend on the JavaScript bridge being available in the current WebView.
 */
export function isBrenUpAndroidShell(): boolean {
  return typeof navigator !== 'undefined' && /(?:^|\s)BrenUpAndroid(?:\s|$)/.test(navigator.userAgent);
}

export async function getNativeDeviceInfo(): Promise<DeviceInfo> {
  if (!isBrenUpNativeApp()) return { platform: 'web', isNativeApp: false };
  return requestNative<DeviceInfo>('getDeviceInfo');
}

export async function requestNativeScreenCapture(purpose: 'share' | 'record' = 'share'): Promise<ScreenCaptureResult> {
  if (!isBrenUpNativeApp()) return { granted: false, message: 'Screen capture is only available in the BrenUp Android app.' };
  return requestNative<ScreenCaptureResult>('requestScreenCapturePermission', { purpose });
}

/** Build a video MediaStream from transient JPEG frames supplied by MediaProjection. */
export async function getNativeScreenCaptureStream(frameUrl: string): Promise<MediaStream> {
  if (!isBrenUpNativeApp()) throw new Error('Native screen capture is only available in the BrenUp Android app.');
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context || !canvas.captureStream) throw new Error('Screen sharing is unavailable in this Android WebView.');
  const stream = canvas.captureStream(8);
  const image = new Image();
  image.crossOrigin = 'anonymous';
  let running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previousFrameAt = 0;
  const stopStream = () => {
    running = false;
    if (timer) clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
  };
  const poll = () => {
    if (!running) return;
    image.onload = () => {
      if (running && image.naturalWidth > 0) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0);
        previousFrameAt = Date.now();
      }
      timer = setTimeout(poll, 125);
    };
    image.onerror = () => {
      if (previousFrameAt > 0 && Date.now() - previousFrameAt > 1500) stopStream();
      else timer = setTimeout(poll, 250);
    };
    image.src = `${frameUrl}?t=${Date.now()}`;
  };
  poll();
  for (let i = 0; i < 40 && previousFrameAt === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!previousFrameAt) {
    stopStream();
    throw new Error('Android screen capture did not deliver a frame. Please try again.');
  }
  const videoTrack = stream.getVideoTracks()[0];
  videoTrack.addEventListener('ended', () => {
    stopStream();
  }, { once: true });
  return stream;
}

export async function stopNativeScreenCapture(): Promise<void> {
  if (isBrenUpNativeApp()) await requestNative<{ stopped: boolean }>('stopScreenCapture');
}

export async function shareNativeContent(content: { title: string; text: string; url: string }): Promise<boolean> {
  if (!isBrenUpNativeApp()) return false;
  const result = await requestNative<{ shared: boolean }>('shareContent', {
    title: content.title.slice(0, 120),
    text: content.text.slice(0, 2000),
    url: content.url,
  });
  return result.shared;
}

export async function getNativePushToken(): Promise<string> {
  const result = await requestNative<{ token: string }>('getPushToken');
  return result.token;
}

export async function deleteNativePushToken(): Promise<void> {
  await requestNative<{ deleted: boolean }>('deletePushToken');
}

export async function setNativePushRegistrationEnabled(enabled: boolean, token?: string): Promise<void> {
  await requestNative<{ enabled: boolean }>('setPushRegistrationEnabled', { enabled: String(enabled), token: token ?? '' });
}

/** Save a local export through Android's document picker using bounded bridge messages. */
export async function saveNativeFile(blob: Blob, filename: string): Promise<boolean> {
  const safeName = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200);
  const mimeType = blob.type.toLowerCase().split(';', 1)[0];
  if (!safeName || !blob.size || blob.size > 500_000_000 || !['video/webm', 'video/mp4', 'image/png', 'application/zip'].includes(mimeType)) {
    throw new Error('This file cannot be saved from the Android app.');
  }
  const started = await requestNative<{ transferId: string }>('startLocalFileSave', {
    filename: safeName,
    mimeType,
    size: String(blob.size),
  }, 0);
  if (!started.transferId) return false;

  try {
    const chunkSize = 512_000;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 8192, bytes.length)));
      }
      const result = await requestNative<{ written: number }>('appendLocalFileSaveChunk', {
        transferId: started.transferId,
        chunk: btoa(binary),
      });
      if (result.written !== bytes.length) throw new Error('Android could not write the complete file.');
    }
    const result = await requestNative<{ saved: boolean }>('finishLocalFileSave', { transferId: started.transferId });
    return result.saved;
  } catch (error) {
    await requestNative<{ cancelled: boolean }>('cancelLocalFileSave', { transferId: started.transferId }).catch(() => undefined);
    throw error;
  }
}

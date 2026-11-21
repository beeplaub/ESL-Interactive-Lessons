export function microphoneErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access is blocked. Allow it in this site’s browser settings, then try again.";
  if (name === "NotFoundError")
    return "No microphone was found. Connect a microphone or choose another device.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The microphone could not be opened. Check its connection and close other apps using it.";
  if (name === "OverconstrainedError")
    return "That microphone is no longer available. Choose another device or use the default.";

  return "The microphone could not start. Check browser and device permissions, then try again.";
}

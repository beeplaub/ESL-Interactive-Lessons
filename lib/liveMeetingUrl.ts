export function liveMeetingUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { href: url.href, label: url.hostname === "meet.google.com" ? "Google Meet" : url.hostname === "call.whatsapp.com" ? "WhatsApp" : url.hostname === "meet.jit.si" ? "Jitsi" : "meeting" };
  } catch { return null; }
}

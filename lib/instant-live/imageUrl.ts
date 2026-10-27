/** Accept public HTTPS image links without making server-side requests. */
export function normalizeLiveImageUrl(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const numericHost = /^[\d.]+$/.test(hostname);
    if (
      url.protocol !== "https:" ||
      !hostname ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      numericHost ||
      hostname.includes(":")
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

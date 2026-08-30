"use client";

import QRCode from "qrcode";
import { Copy, Download, Link2, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function AudioQrCodeStudio() {
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const value = audioUrl.trim();
    if (!value) {
      setQrDataUrl("");
      setError("");
      return;
    }
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Use an http or https audio link.");
      setError("");
      void QRCode.toDataURL(value, { width: 720, margin: 2, errorCorrectionLevel: "M", color: { dark: "#29294d", light: "#ffffff" } })
        .then(setQrDataUrl)
        .catch(() => setError("This link could not be turned into a QR code."));
    } catch (cause) {
      setQrDataUrl("");
      setError(cause instanceof Error ? cause.message : "Enter a valid audio link.");
    }
  }, [audioUrl]);

  const download = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${(title.trim() || "audio-qr-code").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "audio-qr-code"}.png`;
    link.click();
  };

  const copyLink = async () => {
    if (!audioUrl.trim()) return;
    await navigator.clipboard.writeText(audioUrl.trim());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const reset = () => { setTitle(""); setAudioUrl(""); setQrDataUrl(""); setError(""); };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><Link2 size={21} /></span>
          <div><h2 className="text-lg font-semibold">Create an audio QR code</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Paste a public audio link and create a printable QR code instantly.</p></div>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-ink">Name <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Unit 1 listening audio" className="field mt-1.5" /></label>
          <label className="block text-sm font-semibold text-ink">Audio link<input value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder="https://…/audio.mp3" className="field mt-1.5" autoComplete="url" /></label>
          <p className="rounded-xl bg-[var(--br-surface-muted)] px-3 py-2.5 text-xs leading-5 text-[var(--br-text-muted)]">Use a public HTTPS link that learners can open. The QR code contains only this link; no audio is uploaded or stored here.</p>
          {error ? <p className="text-sm font-semibold text-[var(--br-danger)]" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-2 border-t border-[var(--br-border)] pt-5"><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-4 py-2.5 text-sm font-semibold"><RefreshCw size={15} /> Clear</button><button type="button" onClick={() => void copyLink()} disabled={!audioUrl.trim()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"><Copy size={15} /> {copied ? "Copied" : "Copy link"}</button><button type="button" onClick={download} disabled={!qrDataUrl} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-action)] px-4 py-2.5 text-sm font-bold text-on-dark disabled:cursor-not-allowed disabled:opacity-45"><Download size={15} /> Download PNG</button></div>
        </div>
      </section>
      <section className="rounded-2xl border border-[var(--br-border)] bg-dark p-5 text-on-dark shadow-lg sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-white/55">Preview</p><h2 className="mt-1 text-lg font-semibold">{title.trim() || "Audio QR code"}</h2></div><QrCode size={22} className="text-[var(--br-action)]" /></div>
        <div className="mt-5 grid min-h-72 place-items-center rounded-xl bg-white p-5">{qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${title.trim() || "audio link"}`} className="aspect-square w-full max-w-64" /> : <div className="text-center text-dark/55"><QrCode size={52} className="mx-auto opacity-30" /><p className="mt-3 text-sm">Your QR code will appear here.</p></div>}</div>
        <p className="mt-4 text-xs leading-5 text-white/55">Download the PNG and add it to a worksheet, slide, or classroom handout.</p>
      </section>
    </div>
  );
}

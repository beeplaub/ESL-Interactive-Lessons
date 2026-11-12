"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { saveProfileSocialLink } from "@/app/profile/actions";
import { SOCIAL_PLATFORM_INFO, SOCIAL_PLATFORMS, parseProfileSocialLinks, type ProfileSocialLinks, type SocialPlatform } from "@/lib/profileSocialLinks";

const brandColors: Record<SocialPlatform, string> = {
  youtube: "#ff0033",
  linkedin: "#0a66c2",
  facebook: "#1877f2",
  twitter: "#1d9bf0",
  instagram: "#d9468f",
};

export function ProfileSocialLinks({ initialLinks }: { initialLinks: unknown }) {
  const [links, setLinks] = useState<ProfileSocialLinks>(() => parseProfileSocialLinks(initialLinks));
  const [activePlatform, setActivePlatform] = useState<SocialPlatform | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const info = activePlatform ? SOCIAL_PLATFORM_INFO[activePlatform] : null;

  function openEditor(platform: SocialPlatform) {
    setActivePlatform(platform);
    setInputValue(links[platform] ?? "");
    setError(null);
    setSaved(false);
  }

  function closeEditor() {
    if (isPending) return;
    setActivePlatform(null);
    setError(null);
    setSaved(false);
  }

  function save() {
    if (!activePlatform) return;
    setError(null);
    startTransition(async () => {
      const result = await saveProfileSocialLink(activePlatform, inputValue);
      if (!result.success) {
        setError(result.error ?? "Could not save this link. Please try again.");
        return;
      }
      const nextValue = result.url;
      setLinks((current) => ({ ...current, [activePlatform]: nextValue || undefined }));
      setSaved(true);
      window.setTimeout(() => {
        setActivePlatform(null);
        setSaved(false);
      }, 900);
    });
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-center gap-2.5" aria-label="Social links">
        {SOCIAL_PLATFORMS.map((platform) => (
          <button
            key={platform}
            type="button"
            onClick={() => openEditor(platform)}
            aria-label={`${links[platform] ? "Edit" : "Add"} ${SOCIAL_PLATFORM_INFO[platform].label} link`}
            title={SOCIAL_PLATFORM_INFO[platform].label}
            className="group grid size-10 place-items-center rounded-full border border-[var(--br-border)] bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]"
            style={{ color: brandColors[platform] }}
          >
            <SocialMark platform={platform} />
            {links[platform] ? <span className="sr-only">Link saved</span> : null}
          </button>
        ))}
      </div>

      {activePlatform && info ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="social-link-title" className="w-full max-w-sm rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--br-canvas-elevated)]" style={{ color: brandColors[activePlatform] }}><SocialMark platform={activePlatform} /></span>
                <div>
                  <h2 id="social-link-title" className="text-base font-extrabold text-[var(--br-text)]">{links[activePlatform] ? "Edit" : "Add"} {info.label} link</h2>
                  <p className="mt-0.5 text-xs text-[var(--br-text-muted)]">Add a public profile or channel URL.</p>
                </div>
              </div>
              <button type="button" onClick={closeEditor} disabled={isPending} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--br-text-muted)] hover:bg-[var(--br-canvas-elevated)]"><X size={17} /></button>
            </div>

            <label className="mt-5 block text-xs font-bold text-[var(--br-text)]">
              Link
              <input
                autoFocus
                type="url"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
                placeholder={info.placeholder}
                className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3.5 py-3 text-sm font-medium text-[var(--br-text)] outline-none transition placeholder:text-[var(--br-text-muted)]/70 focus:border-[var(--br-chart-primary)]"
              />
            </label>
            {error ? <p role="alert" className="mt-2 text-xs font-semibold text-[var(--br-danger)]">{error}</p> : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--br-text-muted)]">{saved ? <span className="inline-flex items-center gap-1 text-[var(--br-chart-secondary)]"><Check size={14} /> Saved</span> : links[activePlatform] ? <a href={links[activePlatform]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--br-text)]">Open saved link <ExternalLink size={12} /></a> : "Only you can edit this link."}</p>
              <button type="button" onClick={save} disabled={isPending || saved} className="rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-on-dark transition hover:opacity-90 disabled:opacity-60">{isPending ? "Saving…" : saved ? "Saved" : "Save"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function ProfileSocialIconLinks({ initialLinks, className = "" }: { initialLinks: unknown; className?: string }) {
  const links = parseProfileSocialLinks(initialLinks);
  const availablePlatforms = SOCIAL_PLATFORMS.filter((platform) => links[platform]);
  if (!availablePlatforms.length) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-label="Instructor social links">
      {availablePlatforms.map((platform) => (
        <a
          key={platform}
          href={links[platform]}
          target="_blank"
          rel="noreferrer"
          aria-label={`${SOCIAL_PLATFORM_INFO[platform].label} profile`}
          title={SOCIAL_PLATFORM_INFO[platform].label}
          className="grid size-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--br-chart-primary)_18%,var(--br-border))] bg-surface shadow-md transition hover:-translate-y-0.5 hover:border-[var(--br-chart-primary)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]"
          style={{ color: brandColors[platform] }}
        >
          <SocialMark platform={platform} />
        </a>
      ))}
    </div>
  );
}

function SocialMark({ platform }: { platform: SocialPlatform }) {
  if (platform === "youtube") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.7V8.3l6.3 3.7-6.3 3.7Z" /></svg>;
  if (platform === "linkedin") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="currentColor" d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.34H4.97V9.02h2.96v9.32ZM6.45 7.75a1.72 1.72 0 1 1 0-3.44 1.72 1.72 0 0 1 0 3.44Zm12 10.59h-2.95v-4.53c0-1.08-.02-2.47-1.5-2.47-1.5 0-1.73 1.17-1.73 2.39v4.61H9.32V9.02h2.83v1.27h.04c.4-.74 1.36-1.51 2.8-1.51 2.99 0 3.54 1.97 3.54 4.53v5.03Z" /></svg>;
  if (platform === "facebook") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="currentColor" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.35c0-3 1.79-4.66 4.53-4.66 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.95.92-1.95 1.86V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" /></svg>;
  if (platform === "twitter") return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="currentColor" d="M22.46 6c-.77.35-1.6.58-2.46.69a4.28 4.28 0 0 0 1.88-2.36 8.55 8.55 0 0 1-2.72 1.04 4.27 4.27 0 0 0-7.28 3.89 12.13 12.13 0 0 1-8.8-4.46 4.26 4.26 0 0 0 1.32 5.7 4.22 4.22 0 0 1-1.94-.54v.05a4.27 4.27 0 0 0 3.42 4.18 4.3 4.3 0 0 1-1.93.07 4.28 4.28 0 0 0 3.99 2.97A8.57 8.57 0 0 1 1.63 19c-.28 0-.56-.02-.84-.05a12.1 12.1 0 0 0 6.56 1.92c7.88 0 12.2-6.53 12.2-12.2l-.01-.56A8.7 8.7 0 0 0 22.46 6Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="none" stroke="currentColor" strokeWidth="2.2" /><rect x="6.7" y="6.7" width="10.6" height="10.6" rx="3.4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.4" cy="6.8" r="1.1" fill="currentColor" /></svg>;
}

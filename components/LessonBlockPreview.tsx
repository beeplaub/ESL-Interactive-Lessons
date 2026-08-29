"use client";

import { BookOpen, Braces, Check, CheckCircle2, FlipHorizontal2, ImageIcon, ListChecks, Maximize, Minimize, MessageSquareQuote, Pause, Play, PlayCircle, Settings, Volume2, RotateCcw, RotateCw, SkipBack, SkipForward, MapPin } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Json } from "@/types/database.types";
import { AudioTrackPlayer } from "@/components/AudioTrackPlayer";
import { parseAudioTracks } from "@/lib/audioTracks";

export type PreviewLessonBlock = {
  id: string;
  position: number;
  block_type: string;
  content: Json;
};

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function textAlignClass(value: unknown) {
  const v = asString(value);
  if (v === "center") return "text-center";
  if (v === "right") return "text-right";
  return "text-left";
}

function verticalAlignClass(value: unknown) {
  const v = asString(value);
  if (v === "top") return "justify-start";
  if (v === "bottom") return "justify-end";
  return "justify-center";
}

function relativeLuminance(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(l1: number, l2: number) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextColor(hex: unknown) {
  const value = /^#[0-9a-fA-F]{6}$/.test(asString(hex)) ? asString(hex) : "var(--br-info)";
  const backgroundLuminance = relativeLuminance(value);
  const whiteContrast = contrastRatio(backgroundLuminance, 1);
  const inkContrast = contrastRatio(backgroundLuminance, relativeLuminance("var(--br-text)"));
  return whiteContrast >= inkContrast ? "var(--br-text-on-dark)" : "var(--br-text)";
}

function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function getGoogleDriveFileId(value: string) {
  const directMatch = value.match(/[?&]id=([^&]+)/);
  if (directMatch?.[1]) return directMatch[1];
  const fileMatch = value.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  return "";
}

function mediaUrl(value: string, kind: "image" | "audio") {
  const id = getGoogleDriveFileId(value);
  if (id) {
    return kind === "image"
      ? `https://drive.google.com/uc?export=view&id=${id}`
      : `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return value;
}

function ReadingPassageAudioButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  if (!src) return null;
  return <><audio ref={audioRef} src={mediaUrl(src, "audio")} preload="none" onEnded={() => setPlaying(false)} /><button type="button" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); setPlaying(true); } else { audio.pause(); setPlaying(false); } }} className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--br-border)] bg-surface text-[var(--br-brand)] shadow-sm transition hover:bg-[var(--br-surface-muted)]" aria-label={playing ? "Pause reading passage audio" : "Play reading passage audio"} title={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button></>;
}

function ZoomableImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} className={`${className} cursor-zoom-in`} onClick={() => setOpen(true)} />
    <button type="button" onClick={() => setOpen(true)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/75" aria-label="Expand image" title="Expand image"><Maximize size={17} /></button>
    {open && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Expanded image" onClick={() => setOpen(false)}>
        <div className="absolute left-4 top-4 text-xs font-semibold text-white/70">Tap outside or press Esc to close</div>
        <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20" aria-label="Close expanded image"><Minimize size={18} /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-full max-w-full touch-auto select-none object-contain" onClick={(event) => event.stopPropagation()} />
      </div>,
      document.body,
    ) : null}
  </>;
}

function getYouTubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id || "";
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
      return id || "";
    }
  } catch {
    return "";
  }
  return "";
}

export function LessonBlockPreview({
  blocks,
  emptyText = "No editable blocks yet. Add content blocks to preview the future LMS lesson view.",
  checklistState = {},
  onChecklistChange
}: {
  blocks: PreviewLessonBlock[];
  emptyText?: string;
  checklistState?: Record<string, boolean[]>;
  onChecklistChange?: (blockId: string, checkedItems: boolean[]) => void;
}) {
  if (!blocks.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--br-border)] bg-surface p-6 text-center text-sm text-[var(--br-text-muted)]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {blocks.map((block) => (
        <PreviewBlock key={block.id} block={block} checkedItems={checklistState[block.id]} onChecklistChange={onChecklistChange} />
      ))}
    </div>
  );
}

function PreviewBlock({ block, checkedItems, onChecklistChange }: { block: PreviewLessonBlock; checkedItems?: boolean[]; onChecklistChange?: (blockId: string, checkedItems: boolean[]) => void }) {
  const content = asRecord(block.content);

  if (block.block_type === "HEADING") {
    const level = asString(content.level) || "H2";
    const text = asString(content.text) || "Untitled heading";
    const align = textAlignClass(content.text_align);
    if (level === "H1") return <h1 className={`text-3xl font-semibold tracking-tight text-ink ${align}`}>{text}</h1>;
    if (level === "H3") return <h3 className={`text-lg font-semibold text-ink ${align}`}>{text}</h3>;
    if (level === "H4") return <h4 className={`text-base font-semibold text-ink ${align}`}>{text}</h4>;
    return <h2 className={`text-2xl font-semibold tracking-tight text-ink ${align}`}>{text}</h2>;
  }

  if (block.block_type === "TEXT") {
    return <FormattedText text={asString(content.body)} align={textAlignClass(content.text_align)} />;
  }

  if (block.block_type === "INSTRUCTION") {
    return (
      <section className="overflow-hidden rounded-[20px] border border-[var(--br-action)]/25 bg-gradient-to-br from-[var(--br-action)]/10 via-surface to-[var(--br-brand-soft)]/45 shadow-sm">
        <div className="border-l-4 border-[var(--br-action)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="min-w-0">
            {asString(content.title) ? <h3 className="text-base font-extrabold tracking-tight text-[var(--br-dark-card)]">{asString(content.title)}</h3> : null}
            <div className={`${asString(content.title) ? "mt-1.5" : ""} italic`}><FormattedText text={asString(content.body) || "Add an instruction."} /></div>
          </div>
        </div>
      </section>
    );
  }

  if (block.block_type === "BULLETS") {
    const items = asArray(content.items).map(String).filter(Boolean);
    const hidden = content.reveal_hidden === true;
    const title = asString(content.title) || "Key points";
    const list = items.length ? <ul className="space-y-2 text-base leading-6 text-[var(--br-text-muted)]">{items.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-moss" /><span>{item}</span></li>)}</ul> : <p className="text-sm text-[var(--br-text-muted)]">Add bullet points.</p>;
    return (
      <div className="rounded-lg border border-[var(--br-border)] bg-surface p-3 sm:p-4">
        {hidden ? <details><summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden"><span className="flex min-w-0 items-center gap-2 font-semibold text-ink"><ListChecks size={18} className="shrink-0 text-moss" />{title}</span><span className="shrink-0 rounded-md border border-[var(--br-brand)]/30 bg-[var(--br-brand)]/5 px-2.5 py-1 text-xs font-bold text-[var(--br-brand)]">Reveal</span></summary><div className="mt-3 border-t border-[var(--br-border)] pt-3">{list}</div></details> : <><div className="mb-3 flex items-center gap-2 font-semibold text-ink"><ListChecks size={18} className="text-moss" /> {title}</div>{list}</>}
      </div>
    );
  }

  if (block.block_type === "REVIEW_CHECKLIST") {
    return <ReviewChecklistBlock blockId={block.id} content={content} checkedItems={checkedItems} onChange={onChecklistChange} />;
  }

  if (block.block_type === "QUOTE") {
    const align = textAlignClass(content.text_align);
    return (
      <figure className={`rounded-lg border-l-4 border-moss bg-skywash p-3 sm:p-4 ${align}`}>
        <blockquote className="text-base font-medium leading-7 text-ink sm:text-lg sm:leading-8">
          &ldquo;{asString(content.body) || "Add a quote."}&rdquo;
        </blockquote>
        {asString(content.attribution) ? (
          <figcaption className="mt-2 text-sm text-[var(--br-text-muted)]">— {asString(content.attribution)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "CALLOUT") {
    const align = textAlignClass(content.text_align);
    const hidden = content.reveal_hidden === true;
    const title = asString(content.title);
    const bodyContent = <div className="text-base leading-6 text-amber-900"><FormattedText text={asString(content.body) || "Add a callout message."} /></div>;
    const calloutContent = (
      <div className={align}>
        {title ? <h3 className="font-semibold text-amber-950">{title}</h3> : null}
        <div className="mt-1">{bodyContent}</div>
      </div>
    );
    if (hidden) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <MessageSquareQuote className="mt-0.5 shrink-0 text-amber-700" size={18} />
            <div className={`min-w-0 flex-1 ${align}`}>
              <details>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:hidden">
                  <span className="min-w-0 flex-1 font-semibold text-amber-950">{title || "Reveal note"}</span>
                  <span className="inline-flex shrink-0 rounded-md border border-amber-300 bg-surface px-2 py-1 text-xs font-semibold text-amber-900">Reveal</span>
                </summary>
                <div className="mt-2 border-t border-amber-200 pt-2">{bodyContent}</div>
              </details>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <MessageSquareQuote className="mt-0.5 shrink-0 text-amber-700" size={18} />
          {calloutContent}
        </div>
      </div>
    );
  }

  if (block.block_type === "IMAGE") {
    const path = asString(content.path);
    const src = mediaUrl(path, "image");
    return (
      <figure className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted">
        {path && isImageUrl(path) ? (
          <ZoomableImage src={src} alt={asString(content.alt) || ""} className="mx-auto block h-auto max-h-[520px] max-w-full object-contain" />
        ) : (
          <div className="grid aspect-video place-items-center text-sm text-[var(--br-text-muted)]">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2" size={24} />
              {path || "Add an image URL or storage path."}
            </div>
          </div>
        )}
        {asString(content.caption) ? (
          <figcaption className="border-t border-[var(--br-border)] px-4 py-2 text-sm text-[var(--br-text-muted)]">{asString(content.caption)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "IMAGE_PAIR") {
    const images = (["left", "right"] as const).map((side) => ({
      path: asString(content[`${side}_path`]), alt: asString(content[`${side}_alt`]), caption: asString(content[`${side}_caption`])
    }));
    return <div className="grid gap-4 sm:grid-cols-2">{images.map((image, index) => <figure key={index} className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted shadow-sm">{image.path && isImageUrl(image.path) ? <ZoomableImage src={mediaUrl(image.path, "image")} alt={image.alt} className="max-h-[520px] w-full object-contain" /> : <div className="grid aspect-video place-items-center p-4 text-center text-sm text-[var(--br-text-muted)]">{image.path || "Add an image URL or storage path."}</div>}{image.caption ? <figcaption className="border-t border-[var(--br-border)] bg-surface px-3 py-2 text-sm text-[var(--br-text-muted)]">{image.caption}</figcaption> : null}</figure>)}</div>;
  }

  if (block.block_type === "TONGUE_TWISTER") {
    return <TongueTwisterBlock content={content} />;
  }

  if (block.block_type === "IMAGE_TEXT") {
    const imagePath = asString(content.image_path);
    const src = imagePath ? mediaUrl(imagePath, "image") : "";
    const imageRight = asString(content.image_position) === "right";
    const heading = asString(content.heading);
    const body = asString(content.body);
    const caption = asString(content.caption);
    const alt = asString(content.alt);

    const imageCol = (
      <figure className="relative overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted">
        {src && isImageUrl(src) ? (
          <ZoomableImage src={src} alt={alt || heading || ""} className="h-full max-h-[340px] w-full object-cover" />
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--br-text-muted)]">
            <ImageIcon size={28} />
            <span>Add an image URL</span>
          </div>
        )}
        {caption ? (
          <figcaption className="border-t border-[var(--br-border)] px-3 py-2 text-xs text-[var(--br-text-muted)]">{caption}</figcaption>
        ) : null}
      </figure>
    );

    const textAlign = textAlignClass(content.text_align);
    const verticalAlign = verticalAlignClass(content.vertical_align);

    const textCol = (
      <div className={`flex flex-col gap-3 ${verticalAlign} ${textAlign}`}>
        {heading ? <h3 className="text-xl font-semibold leading-snug text-ink">{heading}</h3> : null}
        {body ? <FormattedText text={body} align={textAlign} /> : <p className="text-sm text-[var(--br-text-muted)]">Add supporting text.</p>}
      </div>
    );

    return (
      <div className="grid items-stretch gap-5 sm:grid-cols-2">
        {imageRight ? <>{textCol}{imageCol}</> : <>{imageCol}{textCol}</>}
      </div>
    );
  }

  if (block.block_type === "IMAGE_ANNOTATION") {
    return <ImageAnnotationBlock content={content} />;
  }

  if (block.block_type === "AUDIO") {
    const path = asString(content.path);
    const audioConfig = parseAudioTracks(path);
    const firstPath = audioConfig.tracks[0]?.url || path;
    const youtubeId = audioConfig.tracks.length === 1 ? getYouTubeId(firstPath) : null;
    return (
      <div>
        {youtubeId ? (
          <YouTubeAudioPlayer videoId={youtubeId} />
        ) : audioConfig.tracks.length > 0 ? (
          <AudioTrackPlayer value={path} resolveUrl={(url) => mediaUrl(url, "audio")} />
        ) : (
          <p className="text-sm text-white/65">{path || "Add an audio URL or storage path."}</p>
        )}
      </div>
    );
  }

  if (block.block_type === "VIDEO") {
    const url = asString(content.url);
    const youtubeId = getYouTubeId(url);
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted">
        {youtubeId ? (
          <CustomYouTubeVideoPlayer
            videoId={youtubeId}
            title={asString(content.title) || "Lesson video"}
            startTime={asString(content.startTime)}
            endTime={asString(content.endTime)}
          />
        ) : url && (/^https?:\/\//i.test(url) || url.startsWith("/")) ? (
          <div className="bg-dark text-on-dark">
            {asString(content.title) ? <p className="border-b border-white/10 px-4 py-2.5 text-sm font-bold">{asString(content.title)}</p> : null}
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload noremoteplayback"
              className="aspect-video w-full bg-black object-contain"
            >
              Your browser does not support video playback.
            </video>
          </div>
        ) : (
          <div className="grid aspect-video place-items-center p-4 text-center">
            <div>
              <PlayCircle size={28} className="mx-auto text-moss" />
              <p className="mt-2 font-semibold">{asString(content.title) || "Video"}</p>
              <p className="mt-1 break-all text-sm text-[var(--br-text-muted)]">{url || "Add a YouTube or video URL."}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (block.block_type === "DIVIDER") {
    return <hr className="border-[var(--br-border)]" />;
  }

  if (block.block_type === "VOCABULARY") {
    const entries = asArray(content.entries);
    return (
      <div className="rounded-lg border border-[var(--br-border)]">
        <div className="border-b border-[var(--br-border)] bg-surface-muted px-4 py-3">
          <h3 className="font-semibold">Vocabulary</h3>
        </div>
        <div className="divide-y divide-black/10">
          {entries.length ? entries.map((item, index) => {
            const entry = asRecord(item as Json);
            return (
              <div key={index} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]">
                <div>
                  <p className="font-semibold text-ink">{asString(entry.word) || "Word"}</p>
                  {asString(entry.pronunciation) ? <p className="text-xs text-[var(--br-text-muted)]">{asString(entry.pronunciation)}</p> : null}
                </div>
                <div className="text-base leading-6 text-[var(--br-text-muted)]">
                  <p>{asString(entry.meaning) || "Meaning"}</p>
                  {asString(entry.example) ? <p className="mt-1 italic text-[var(--br-text-muted)]">{asString(entry.example)}</p> : null}
                  {asString(entry.notes) ? <p className="mt-1 text-xs text-[var(--br-text-muted)]">{asString(entry.notes)}</p> : null}
                </div>
              </div>
            );
          }) : <p className="p-4 text-sm text-[var(--br-text-muted)]">Add vocabulary entries.</p>}
        </div>
      </div>
    );
  }

  if (block.block_type === "GRAMMAR") {
    const title = asString(content.title) || "Grammar focus";
    const examples = asArray(content.examples).map(String).filter(Boolean);
    return (
      <section className="overflow-hidden rounded-[22px] border border-[var(--br-info)]/20 bg-gradient-to-br from-[var(--br-info)]/10 via-surface to-[var(--br-brand-soft)]/45 shadow-sm">
        <div className="flex items-center gap-3 border-b border-[var(--br-info)]/15 px-4 py-4 sm:px-5 sm:py-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--br-info)] text-on-dark shadow-sm"><Braces size={20} /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--br-info)]">Grammar focus</p>
            <h3 className="mt-0.5 truncate text-lg font-extrabold tracking-tight text-[var(--br-dark-card)]">{title}</h3>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {asString(content.explanation) ? <div className="rounded-2xl border border-[var(--br-border)] bg-white/80 px-4 py-3"><FormattedText text={asString(content.explanation)} /></div> : null}
          {examples.length ? <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-text-muted)]">Examples</p><div className="grid gap-2 sm:grid-cols-2">{examples.map((example, index) => <div key={index} className="flex items-start gap-3 rounded-2xl border border-[var(--br-success)]/20 bg-[var(--br-success-soft)]/55 px-3 py-3 text-sm font-semibold leading-6 text-[var(--br-dark-card)]"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--br-success)] text-xs font-black text-on-dark">{index + 1}</span><div className="min-w-0"><FormattedText text={example} /></div></div>)}</div></div> : null}
          {asString(content.notes) ? <div className="rounded-2xl border border-[var(--br-achievement)]/25 bg-[var(--br-achievement)]/10 px-4 py-3"><p className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-achievement)]">Remember</p><FormattedText text={asString(content.notes)} /></div> : null}
        </div>
      </section>
    );
  }

  if (block.block_type === "READING") {
    const audioPath = asString(content.audio_path);
    return (
      <article className="rounded-lg border border-[var(--br-border)] p-4">
        {asString(content.title) || audioPath ? <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={18} className="text-moss" />
          {asString(content.title) ? <h3 className="font-semibold">{asString(content.title)}</h3> : null}
          </div>
          <ReadingPassageAudioButton src={audioPath} />
        </div> : null}
        <FormattedText text={asString(content.passage) || "Add a reading passage."} />
        {asArray(content.questions).length ? (
          <div className="mt-4 rounded-md bg-surface-muted p-3">
            <p className="text-base font-semibold">Questions</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-base text-[var(--br-text-muted)]">
              {asArray(content.questions).map((question, index) => (
                <li key={index}>{String(question)}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </article>
    );
  }

  if (block.block_type === "DIALOGUE") {
    const turns = asArray(content.turns);
    const people = asArray(content.people).map((item) => asRecord(item as Json));
    return (
      <div className="space-y-2">
        {asString(content.title) ? <h3 className="font-semibold text-ink">{asString(content.title)}</h3> : null}
        {turns.length ? turns.map((item, index) => {
          const turn = asRecord(item as Json);
          const person = people.find((candidate) => asString(candidate.id) === asString(turn.speaker_id)) ?? null;
          const speaker = asString(person?.name) || asString(turn.speaker) || "Speaker";
          return (
            <div key={index} className="rounded-lg border border-[var(--br-border)] bg-surface p-3">
              <p className="w-fit rounded-full px-2 py-0.5 text-xs font-semibold text-on-dark" style={{ backgroundColor: asString(person?.color) || "var(--br-brand)" }}>{speaker}</p>
              <div className="mt-2 flex items-start gap-2"><div className="min-w-0 flex-1"><FormattedText text={asString(turn.line) || "Dialogue line"} /></div>{asString(turn.audio_url) ? <DialogueAudioButton src={mediaUrl(asString(turn.audio_url), "audio")} speaker={speaker} /> : null}</div>
            </div>
          );
        }) : <p className="rounded-lg border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">Add dialogue turns.</p>}
      </div>
    );
  }

  if (block.block_type === "FLASHCARD") {
    return <FlashcardBlock content={content} />;
  }

  if (block.block_type === "COMMON_MISTAKE") {
    return <CommonMistakeBlock content={content} />;
  }

  if (block.block_type === "CONTRAST_PAIR") {
    return <ContrastPairBlock content={content} />;
  }

  if (block.block_type === "TABLE") {
    return <TableBlock content={content} />;
  }

  return null;
}

function ImageAnnotationBlock({ content }: { content: Record<string, unknown> }) {
  const path = asString(content.path);
  const src = mediaUrl(path, "image");
  const markerSize = Math.min(64, Math.max(20, Number(content.marker_size) || 32));
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const [imageWidth, setImageWidth] = useState(800);
  useEffect(() => {
    const frame = imageFrameRef.current;
    if (!frame) return;
    const updateWidth = () => setImageWidth(frame.clientWidth || 800);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [path]);
  const renderedMarkerSize = Math.max(16, Math.round(markerSize * Math.min(1, imageWidth / 800)));
  const markers = asArray(content.markers).map((item, index) => {
    const marker = asRecord(item as Json);
    return {
      id: asString(marker.id),
      label: asString(marker.label),
      detail: asString(marker.detail),
      example: asString(marker.example),
      audioUrl: asString(marker.audio_url ?? marker.audioUrl),
      index: index + 1,
      x: Math.min(100, Math.max(0, Number(marker.x) || 50)),
      y: Math.min(100, Math.max(0, Number(marker.y) || 50))
    };
  });
  const [active, setActive] = useState<number | null>(null);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const current = active === null ? null : markers[active];
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface">
      {asString(content.title) ? <h3 className="px-4 pt-4 text-lg font-semibold text-ink">{asString(content.title)}</h3> : null}
      {asString(content.instruction) ? <p className="px-4 pt-1 text-sm text-[var(--br-text-muted)]">{asString(content.instruction)}</p> : null}
      <div className="p-3 sm:p-4">
        {path && isImageUrl(src) ? (
          <div ref={imageFrameRef} className="relative overflow-hidden rounded-lg bg-surface-muted">
            <img src={src} alt={asString(content.alt)} className="block h-auto w-full" />
            {markers.map((marker) => (
              <button key={String(marker.id ?? marker.index)} type="button" onClick={() => { const hasText = Boolean(marker.label || marker.detail || marker.example); if (!hasText && marker.audioUrl) { void audioRefs.current[marker.index - 1]?.play(); setActive(null); } else setActive((currentIndex) => currentIndex === marker.index - 1 ? null : marker.index - 1); }} aria-label={`Marker ${marker.index}${asString(marker.label) ? `: ${asString(marker.label)}` : ""}`} className={`absolute -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--br-info)] bg-white text-sm font-bold text-[var(--br-info)] shadow-lg transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--br-info)] focus:ring-offset-2 ${active === marker.index - 1 ? "ring-2 ring-[var(--br-info)] ring-offset-2" : ""}`} style={{ left: `${marker.x}%`, top: `${marker.y}%`, width: renderedMarkerSize, height: renderedMarkerSize, fontSize: Math.max(10, Math.round(renderedMarkerSize * 0.34)), display: "grid" }}>{marker.index}</button>
            ))}
            {markers.map((marker, index) => marker.audioUrl ? <audio key={`annotation-audio-${marker.id}`} ref={(element) => { audioRefs.current[index] = element; }} src={mediaUrl(marker.audioUrl, "audio")} preload="none" /> : null)}
            {current ? (
              <div className="absolute inset-0 z-10 grid place-items-center p-2 sm:p-4" role="presentation">
                <div className="max-h-[78%] w-[84%] overflow-y-auto rounded-xl border border-[var(--br-info)] bg-white p-3 text-[13px] shadow-2xl sm:max-h-[84%] sm:w-[min(92%,22rem)] sm:rounded-2xl sm:p-4 sm:text-base" role="dialog" aria-label={asString(current.label) || `Marker ${current.index}`}>
                  <div className="flex items-start gap-2"><MapPin size={17} className="mt-0.5 shrink-0 text-[var(--br-info)]" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink sm:text-base">{asString(current.label) || `Marker ${current.index}`}</p>{asString(current.detail) ? <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)] sm:text-sm sm:leading-6">{asString(current.detail)}</p> : null}{asString(current.example) ? <p className="mt-2 rounded-lg bg-[var(--br-info)]/10 px-2.5 py-2 text-xs italic text-ink sm:px-3">{asString(current.example)}</p> : null}</div>{current.audioUrl ? <button type="button" onClick={() => { void audioRefs.current[current.index - 1]?.play(); }} className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--br-info)] text-[var(--br-info)]" aria-label="Play annotation audio"><Volume2 size={15} /></button> : null}<button type="button" onClick={() => setActive(null)} className="shrink-0 rounded-full border border-[var(--br-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--br-text-muted)] sm:text-[11px]">Close</button></div>
                </div>
              </div>
            ) : null}
          </div>
        ) : <div className="grid aspect-video place-items-center rounded-lg bg-surface-muted text-sm text-[var(--br-text-muted)]"><ImageIcon size={24} /> Add an image URL.</div>}
      </div>
    </section>
  );
}

function ReviewChecklistBlock({ blockId, content, checkedItems, onChange }: { blockId: string; content: Record<string, unknown>; checkedItems?: boolean[]; onChange?: (blockId: string, checkedItems: boolean[]) => void }) {
  const items = useMemo(() => asArray(content.items).map(String).filter(Boolean), [content.items]);
  const [localChecked, setLocalChecked] = useState<boolean[]>(() => items.map((_, index) => checkedItems?.[index] === true));
  const currentChecked = checkedItems ?? localChecked;
  const completedCount = items.reduce((count, _, index) => count + (currentChecked[index] ? 1 : 0), 0);
  const allComplete = items.length > 0 && completedCount === items.length;

  useEffect(() => {
    setLocalChecked((current) => items.map((_, index) => checkedItems?.[index] ?? current[index] ?? false));
  }, [checkedItems, items]);

  function toggleItem(index: number) {
    const next = items.map((_, itemIndex) => itemIndex === index ? !currentChecked[itemIndex] : Boolean(currentChecked[itemIndex]));
    setLocalChecked(next);
    onChange?.(blockId, next);
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-[var(--br-brand)]/20 bg-gradient-to-br from-[var(--br-brand-soft)] via-surface to-[var(--br-success-soft)]/40 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--br-brand)]/15 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--br-brand)] text-on-dark shadow-sm"><CheckCircle2 size={21} /></span>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold tracking-tight text-[var(--br-dark-card)]">{asString(content.title) || "I can now…"}</h3>
            {asString(content.intro) ? <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">{asString(content.intro)}</p> : null}
          </div>
        </div>
        {items.length ? <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${allComplete ? "bg-[var(--br-success-soft)] text-[var(--br-chart-secondary)]" : "bg-white/75 text-[var(--br-brand)]"}`}>{completedCount}/{items.length} checked</span> : null}
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        {items.length ? items.map((item, index) => {
          const isChecked = Boolean(currentChecked[index]);
          return <label key={`${item}-${index}`} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition sm:px-4 ${isChecked ? "border-[var(--br-success)]/30 bg-[var(--br-success-soft)]/60" : "border-[var(--br-border)] bg-white/75 hover:border-[var(--br-brand)]/35 hover:bg-white"}`}>
            <input type="checkbox" checked={isChecked} onChange={() => toggleItem(index)} className="peer sr-only" />
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition ${isChecked ? "border-[var(--br-success)] bg-[var(--br-success)] text-on-dark" : "border-[var(--br-brand)]/40 bg-white text-transparent"}`} aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            <span className={`min-w-0 text-sm font-semibold leading-6 ${isChecked ? "text-[var(--br-chart-secondary)] line-through decoration-[var(--br-success)]/60" : "text-[var(--br-dark-card)]"}`}>{item}</span>
          </label>;
        }) : <p className="text-sm text-[var(--br-text-muted)]">Add review statements.</p>}
      </div>
    </section>
  );
}

function CommonMistakeBlock({ content }: { content: Record<string, unknown> }) {
  const examples = asArray(content.examples).map((item) => asRecord(item as Json));
  const pair = (incorrect: string, correct: string, context?: string) => (
    <div className="grid gap-2">
      {context ? <p className="text-sm leading-6 text-[var(--br-text-muted)]">{context}</p> : null}
      <div className="rounded-md border border-coral/25 bg-coral/10 px-3 py-2 text-base leading-6 text-ink"><span className="mr-2 font-bold text-coral">✕ Wrong</span>{incorrect || "Add the incorrect sentence."}</div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-base leading-6 text-ink"><span className="mr-2 font-bold text-emerald-700">✓ Right</span>{correct || "Add the corrected sentence."}</div>
    </div>
  );
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <h3 className="font-semibold text-amber-950">{asString(content.title) || "Common mistake"}</h3>
      {asString(content.context) ? <p className="mt-2 text-base leading-6 text-amber-900">{asString(content.context)}</p> : null}
      <div className="mt-4">{pair(asString(content.mistake), asString(content.correction))}</div>
      {asString(content.explanation) ? <p className="mt-4 text-base leading-6 text-amber-950"><span className="font-semibold">Why:</span> {asString(content.explanation)}</p> : null}
      {asString(content.tip) ? <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Tip:</span> {asString(content.tip)}</p> : null}
      {examples.length ? <div className="mt-5 border-t border-amber-200 pt-4"><p className="mb-3 font-semibold text-amber-950">More examples</p><div className="space-y-4">{examples.map((example, index) => <div key={index}>{pair(asString(example.incorrect), asString(example.correct), asString(example.context))}</div>)}</div></div> : null}
    </section>
  );
}

function ContrastPairBlock({ content }: { content: Record<string, unknown> }) {
  const pairs = asArray(content.pairs).map((item) => asRecord(item as Json));
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--br-brand)]/25 bg-gradient-to-br from-[var(--br-brand-soft)] via-surface to-[var(--br-info)]/10 shadow-sm">
      <div className="border-b border-[var(--br-brand)]/15 bg-[var(--br-brand)]/10 px-4 py-3 sm:px-5">
        <h3 className="font-semibold text-ink">{asString(content.title) || "Contrast pairs"}</h3>
        {asString(content.instruction) ? <p className="mt-1 text-sm text-[var(--br-text-muted)]">{asString(content.instruction)}</p> : null}
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        {pairs.length ? pairs.map((pair, index) => <details key={index} className="group rounded-xl border border-amber-200 bg-amber-50 shadow-sm transition hover:border-amber-300">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-3 marker:hidden group-open:rounded-b-none sm:p-4">
            <span className="flex min-w-0 flex-1 items-center gap-3 font-semibold text-amber-950"><MessageSquareQuote className="shrink-0 text-amber-700" size={17} />{asString(pair.title) || `${asString(pair.left_term)} vs. ${asString(pair.right_term)}`}</span>
            <span className="inline-flex shrink-0 rounded-md border border-amber-300 bg-surface px-2 py-1 text-xs font-semibold text-amber-900">Reveal</span>
          </summary>
          <div className="border-t border-[var(--br-brand)]/15 p-3 sm:p-4">
            {asString(pair.context) ? <p className="mb-4 rounded-lg bg-[var(--br-info)]/10 px-3 py-2 text-sm leading-6 text-ink">{asString(pair.context)}</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <ContrastSide variant="left" color={asString(pair.left_color) || "var(--br-brand)"} term={asString(pair.left_term)} meaning={asString(pair.left_meaning)} pattern={asString(pair.left_pattern)} examples={pair.left_examples} />
              <ContrastSide variant="right" color={asString(pair.right_color) || "var(--br-info)"} term={asString(pair.right_term)} meaning={asString(pair.right_meaning)} pattern={asString(pair.right_pattern)} examples={pair.right_examples} />
            </div>
            {asString(pair.key_difference) ? <p className="mt-4 rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Key difference:</span> {asString(pair.key_difference)}</p> : null}
            {asString(pair.common_mistake) ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950"><span className="font-semibold">Common mistake:</span> {asString(pair.common_mistake)}</p> : null}
          </div>
        </details>) : <p className="text-sm text-[var(--br-text-muted)]">Add contrast pairs.</p>}
      </div>
    </section>
  );
}

function ContrastSide({ variant, color, term, meaning, pattern, examples }: { variant: "left" | "right"; color: string; term: string; meaning: string; pattern: string; examples: unknown }) {
  const isLeft = variant === "left";
  const fallbackColor = isLeft ? "var(--br-brand)" : "var(--br-info)";
  const patternClass = "border-[var(--br-brand)]/25 text-[var(--br-brand)]";
  return <div className="rounded-xl border p-3 text-on-dark shadow-sm sm:p-4" style={{ backgroundColor: color || fallbackColor, borderColor: color || fallbackColor }}><h4 className="text-lg font-semibold text-on-dark">{term || "Term"}</h4>{meaning ? <p className="mt-1 text-sm leading-6 text-on-dark/85">{meaning}</p> : null}{pattern ? <p className={`mt-3 rounded-md border bg-surface px-2.5 py-1.5 font-mono text-xs ${patternClass}`}>{pattern}</p> : null}{asArray(examples).length ? <div className="mt-3 space-y-1.5">{asArray(examples).map((example, index) => <p key={index} className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm leading-6 text-on-dark">{String(example)}</p>)}</div> : null}</div>;
}

function TongueTwisterBlock({ content }: { content: Record<string, unknown> }) {
  const items = asArray(content.items).map((item) => asRecord(item as Json));
  return <section className="overflow-hidden rounded-xl border border-[var(--br-brand)]/25 bg-gradient-to-br from-[var(--br-brand-soft)] via-surface to-[var(--br-achievement)]/10 shadow-sm"><div className="border-b border-[var(--br-brand)]/15 bg-[var(--br-brand)]/10 px-4 py-3 sm:px-5"><h3 className="font-semibold text-ink">{asString(content.title) || "Tongue Twister Challenge"}</h3>{asString(content.instruction) ? <p className="mt-1 text-sm text-[var(--br-text-muted)]">{asString(content.instruction)}</p> : null}</div><div className="space-y-3 p-3 sm:p-4">{items.length ? items.map((item, index) => <TongueTwisterItem key={index} item={item} index={index} />) : <p className="text-sm text-[var(--br-text-muted)]">Add a tongue twister.</p>}</div></section>;
}

function TongueTwisterItem({ item, index }: { item: Record<string, unknown>; index: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"full" | "chunks">("full");
  const [speed, setSpeed] = useState(1);
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const text = asString(item.text);
  const highlights = asArray(item.highlights).map(String).filter(Boolean);
  const chunks = asArray(item.chunks).map(String).filter(Boolean);
  const words = asArray(item.difficult_words).map((word) => asRecord(word as Json));
  const audio = asString(item.audio_path);
  const hidden = item.hide_reveal_enabled === true && !open;
  const highlightedText = (value: string) => {
    if (!highlights.length) return value;
    const pattern = new RegExp(`(${highlights.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return value.split(pattern).map((part, partIndex) => highlights.some((highlight) => highlight.toLowerCase() === part.toLowerCase()) ? <mark key={partIndex} className="rounded bg-[var(--br-achievement)]/45 px-0.5 text-ink">{part}</mark> : <span key={partIndex}>{part}</span>);
  };
  const setPlayback = (next: number) => { setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; };
  return <details open={!item.hide_reveal_enabled || open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group rounded-xl border border-amber-200 bg-amber-50 shadow-sm"><summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-3 marker:hidden group-open:rounded-b-none sm:p-4"><span className="flex min-w-0 flex-1 items-center gap-3 font-semibold text-amber-950"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--br-achievement)]/40 text-xs font-black text-amber-950">{index + 1}</span>{asString(item.title) || "Tongue twister"}</span><span className="inline-flex shrink-0 rounded-md border border-amber-300 bg-surface px-2 py-1 text-xs font-semibold text-amber-900">{item.hide_reveal_enabled && !open ? "Practice" : "Open"}</span></summary><div className="border-t border-amber-200 p-3 sm:p-4">{asString(item.context) ? <p className="mb-3 text-sm leading-6 text-amber-950">{asString(item.context)}</p> : null}{asString(item.target_sound) ? <span className="inline-flex rounded-full bg-[var(--br-brand)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--br-brand)]">Target: {asString(item.target_sound)}</span> : null}<div className="mt-3 rounded-xl border border-[var(--br-brand)]/20 bg-surface p-4"><div className="text-lg font-semibold leading-8 text-ink sm:text-xl">{hidden ? <span className="text-[var(--br-text-muted)]">Try saying it from memory.</span> : mode === "chunks" && chunks.length ? chunks.map((chunk, chunkIndex) => <span key={chunkIndex} className="mr-2 inline-block rounded-md bg-[var(--br-brand)]/10 px-2 py-1">{highlightedText(chunk)}</span>) : highlightedText(text)}</div>{hidden ? <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900">Reveal text</button> : null}</div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setMode("full")} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${mode === "full" ? "bg-[var(--br-brand)] text-on-dark" : "bg-surface-muted text-[var(--br-brand)]"}`}>Full sentence</button><button type="button" onClick={() => setMode("chunks")} disabled={!chunks.length} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${mode === "chunks" ? "bg-[var(--br-brand)] text-on-dark" : "bg-surface-muted text-[var(--br-brand)] disabled:opacity-40"}`}>Chunks</button>{audio ? <><audio ref={audioRef} src={mediaUrl(audio, "audio")} preload="metadata" /><button type="button" onClick={() => { if (audioRef.current) { audioRef.current.playbackRate = speed; void audioRef.current.play(); } }} className="rounded-md bg-[var(--br-info)] px-3 py-1.5 text-xs font-semibold text-on-dark">Play audio</button></> : null}<span className="ml-auto text-xs font-semibold text-[var(--br-text-muted)]">Speed</span>{[0.75, 1, 1.25].map((value) => <button key={value} type="button" onClick={() => setPlayback(value)} className={`rounded-md px-2 py-1 text-xs font-semibold ${speed === value ? "bg-[var(--br-achievement)] text-ink" : "bg-surface-muted text-[var(--br-text-muted)]"}`}>{value === 1 ? "Natural" : value === 0.75 ? "Slow" : "Fast"}</button>)}</div>{asString(item.pronunciation_note) ? <p className="mt-3 rounded-md bg-[var(--br-info)]/10 px-3 py-2 text-sm leading-6 text-ink"><span className="font-semibold">Tip:</span> {asString(item.pronunciation_note)}</p> : null}{words.length ? <div className="mt-3"><p className="text-sm font-semibold text-ink">Difficult words</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{words.map((word, wordIndex) => <div key={wordIndex} className="rounded-md border border-[var(--br-border)] bg-surface px-3 py-2"><p className="font-semibold text-[var(--br-brand)]">{asString(word.word)} {asString(word.phonetic) ? <span className="font-mono text-xs text-[var(--br-text-muted)]">{asString(word.phonetic)}</span> : null}</p>{asString(word.note) ? <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">{asString(word.note)}</p> : null}</div>)}</div></div> : null}<div className="mt-4 border-t border-[var(--br-border)] pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">Self-check</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{["I kept the target sounds clear.", "I maintained the rhythm.", "I completed it without stopping."] .map((label, checkIndex) => <label key={label} className="flex items-start gap-2 text-xs text-[var(--br-text-muted)]"><input type="checkbox" checked={checked[checkIndex]} onChange={(event) => setChecked((current) => current.map((value, index) => index === checkIndex ? event.target.checked : value))} className="mt-0.5 size-4 rounded border-[var(--br-border)]" />{label}</label>)}</div></div></div></details>;
}

function TableBlock({ content }: { content: Record<string, unknown> }) {
  const headers = asArray(content.headers).map((header) => asString(header));
  const rows = asArray(content.rows).map((row) => asArray(row).map((cell) => asString(cell)));
  const fill = /^#[0-9a-fA-F]{6}$/.test(asString(content.header_fill)) ? asString(content.header_fill) : "var(--br-info)";
  const textColor = readableTextColor(fill);
  const caption = asString(content.caption);

  if (!headers.length) {
    return <p className="text-sm text-[var(--br-text-muted)]">Add table columns to get started.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--br-border)] shadow-sm">
      {caption ? <p className="border-b border-[var(--br-border)] bg-surface-muted px-4 py-2 text-base font-medium text-[var(--br-text-muted)]">{caption}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-base">
          <thead>
            <tr style={{ backgroundColor: fill }}>
              {headers.map((header, index) => (
                <th key={index} className="whitespace-nowrap px-4 py-2.5 text-left font-semibold" style={{ color: textColor }}>
                  {header || `Column ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 1 ? "bg-surface-muted" : "bg-surface"}>
                  {headers.map((_, colIndex) => (
                    <td key={colIndex} className="border-t border-[var(--br-border)] px-4 py-2.5 align-top text-[var(--br-text-muted)]">
                      {row[colIndex] || ""}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-t border-[var(--br-border)] px-4 py-3 text-[var(--br-text-muted)]" colSpan={headers.length}>No rows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlashcardBlock({ content }: { content: Record<string, unknown> }) {
  const rawCards = asArray(content.cards);
  const cards = rawCards.length ? rawCards.map((item) => asRecord(item as Json)) : [content];
  const cardType = asString(content.card_type) === "CARD" ? "CARD" : "IMAGE";
  const frontSide = asString(content.front_side) || (cardType === "CARD" ? "WORD" : "IMAGE");
  return (
    <div className={`grid gap-4 ${cards.length > 1 ? "md:grid-cols-2" : ""}`}>
      {cards.map((card, index) => (
        <SingleFlashcard key={index} content={card} cardType={cardType} frontSide={frontSide} />
      ))}
    </div>
  );
}

function SingleFlashcard({ content, cardType, frontSide }: { content: Record<string, unknown>; cardType: "IMAGE" | "CARD"; frontSide: string }) {
  const [flipped, setFlipped] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imagePath = asString(content.image_path);
  const word = asString(content.word);
  const phonetic = asString(content.phonetic);
  const audioPath = asString(content.audio_path);
  const meaning = asString(content.meaning);
  const examples = asArray(content.examples).map(String).filter(Boolean);
  const imageSrc = imagePath ? mediaUrl(imagePath, "image") : "";
  const audioSrc = audioPath ? mediaUrl(audioPath, "audio") : "";
  const showImageFront = cardType === "IMAGE" && frontSide !== "DETAIL";
  const showWordFront = cardType === "CARD" && frontSide !== "DETAIL";
  const showDetailFront = frontSide === "DETAIL";
  return (
    <div className="w-full select-none" style={{ perspective: "1200px" }}>
      <div className="relative w-full transition-all duration-500" style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)", minHeight: "300px" }}>
        <div className={showDetailFront ? "absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-[var(--br-border)] bg-surface p-6 text-center shadow-sm" : "absolute inset-0 cursor-pointer overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface"} style={{ backfaceVisibility: "hidden", minHeight: "300px" }} onClick={() => setFlipped(true)} role="button" aria-label="Flip card">
          {showImageFront && imageSrc && isImageUrl(imageSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={word || "Flashcard image"} className="h-full w-full bg-surface-muted object-contain" style={{ minHeight: "300px" }} />
          ) : showWordFront ? (
            <div className="grid min-h-[300px] place-items-center bg-surface-muted p-6 text-center"><div><p className="text-4xl font-bold tracking-tight text-ink">{word || "Word"}</p>{phonetic ? <p className="mt-3 font-mono text-sm text-[var(--br-text-muted)]">{phonetic}</p> : null}</div></div>
          ) : showDetailFront ? (
            <FlashcardDetails word={word} phonetic={phonetic} audioSrc={audioSrc} meaning={meaning} examples={examples} audioRef={audioRef} />
          ) : (
            <div className="grid min-h-[300px] place-items-center rounded-2xl bg-surface-strong text-[var(--br-text-muted)]"><div className="flex flex-col items-center gap-2 text-center"><ImageIcon size={40} /><p className="text-sm">Add an image to display here</p></div></div>
          )}
          {showImageFront && imageSrc && isImageUrl(imageSrc) && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-2xl bg-gradient-to-t from-black/50 to-transparent" />}
          <button type="button" onClick={(e) => { e.stopPropagation(); setFlipped(true); }} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-on-dark backdrop-blur-sm transition hover:bg-black/60" aria-label="Flip card"><FlipHorizontal2 size={12} /> Flip</button>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-[var(--br-border)] bg-surface p-6 text-center shadow-sm" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", minHeight: "300px" }}>
          {showImageFront || showWordFront ? (
            <FlashcardDetails word={word} phonetic={phonetic} audioSrc={audioSrc} meaning={meaning} examples={examples} audioRef={audioRef} />
          ) : imageSrc && isImageUrl(imageSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={word || "Flashcard image"} className="max-h-[280px] w-full object-contain" />
          ) : (
            <p className="text-sm text-[var(--br-text-muted)]">Add an image or card details.</p>
          )}
          <button type="button" onClick={() => setFlipped(false)} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-[var(--br-border)] bg-surface px-3 py-1.5 text-xs font-medium text-[var(--br-text-muted)] shadow-sm transition hover:bg-black/5 hover:text-[var(--br-text-muted)]" aria-label="Flip back"><FlipHorizontal2 size={12} /> Flip back</button>
        </div>
      </div>
    </div>
  );
}

function FlashcardDetails({ word, phonetic, audioSrc, meaning, examples, audioRef }: { word: string; phonetic: string; audioSrc: string; meaning: string; examples: string[]; audioRef: RefObject<HTMLAudioElement | null> }) {
  return (
    <>
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="none" />}
      <p className="text-3xl font-bold leading-tight tracking-tight text-ink">{word || "Word"}</p>
      {(phonetic || audioSrc) && (
        <div className="flex items-center justify-center gap-2">
          {phonetic && <span className="font-mono text-sm text-[var(--br-text-muted)]">{phonetic}</span>}
          {audioSrc && (
            <button type="button" onClick={(e) => { e.stopPropagation(); if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } }} title="Play pronunciation" className="flex items-center justify-center rounded-full bg-moss/10 p-1.5 text-moss transition hover:bg-moss/20 active:scale-95"><Volume2 size={15} /></button>
          )}
        </div>
      )}
      <div className="w-12 border-t border-[var(--br-border)]" />
      <p className="max-w-xs text-base leading-relaxed text-[var(--br-text-muted)]">{meaning || "Meaning"}</p>
      {examples.length > 0 && (
        <div className="max-w-xs space-y-1">{examples.map((ex, i) => <p key={i} className="text-sm italic leading-relaxed text-[var(--br-text-muted)]">&ldquo;{ex}&rdquo;</p>)}</div>
      )}
    </>
  );
}

function InlineText({ text }: { text: string }) {
  return <>{text.split(/(\[\[color:#[0-9a-fA-F]{6}\|[^\]]+\]\]|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|_[^_]+_|\[[^\]]+\]\([^)]*\))/g).map((part, index) => {
    const color = part.match(/^\[\[color:(#[0-9a-fA-F]{6})\|(.+)\]\]$/); const link = part.match(/^\[([^\]]+)\]\(([^)]*)\)$/);
    if (color) return <span key={index} style={{ color: color[1] }}>{color[2]}</span>;
    if (link) return <a key={index} href={link[2]} className="underline text-moss" target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("__")) return <span key={index} className="underline underline-offset-2">{part.slice(2, -2)}</span>;
    if (part.startsWith("~~")) return <span key={index} className="line-through">{part.slice(2, -2)}</span>;
    if (part.startsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  })}</>;
}

function FormattedText({ text, align = "text-left" }: { text: string; align?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((line) => line.trim())) return <p className={`text-sm text-[var(--br-text-muted)] ${align}`}>Add text.</p>;
  return <div className={`space-y-2 text-base leading-7 text-[var(--br-text-muted)] ${align}`}>{lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-2" aria-hidden />;
    if (/^#{1,4}\s+/.test(trimmed)) return <p key={index} className="font-bold text-ink"><InlineText text={trimmed.replace(/^#{1,4}\s+/, "")} /></p>;
    if (/^(?:[-*]|\d+[.)])\s+/.test(trimmed)) return <div key={index} className="flex gap-2"><span className="mt-3 size-1.5 shrink-0 rounded-full bg-moss" /><span><InlineText text={trimmed.replace(/^(?:[-*]|\d+[.)])\s+/, "")} /></span></div>;
    return <p key={index}><InlineText text={line} /></p>;
  })}</div>;
}

function DialogueAudioButton({ src, speaker }: { src: string; speaker: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  return <><audio ref={audioRef} src={src} preload="metadata" /><button type="button" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } }} title={`Play ${speaker}'s line`} className="grid size-8 shrink-0 place-items-center rounded-full bg-moss/10 text-moss transition hover:bg-moss/20" aria-label={`Play ${speaker}'s line`}><Volume2 size={15} /></button></>;
}

function CustomAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [openSettings, setOpenSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  function toggle() { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); } else { audio.pause(); } }
  function seek(seconds: number) { const audio = audioRef.current; if (!audio) return; audio.currentTime = Math.max(0, audio.currentTime + seconds); }
  function formatTime(seconds: number) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
  return (
    <div className="overflow-hidden rounded-2xl bg-dark p-3 text-on-dark shadow-lg sm:p-4">
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <div className="flex items-center gap-3"><button type="button" onClick={toggle} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105" aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70"><span>{playing ? "Now playing" : "Ready to play"}</span><span className="tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span></div><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => { const next = Number(event.target.value); setCurrentTime(next); if (audioRef.current) audioRef.current.currentTime = next; }} className="mt-2 h-2 w-full cursor-pointer accent-[var(--br-action)]" aria-label="Audio progress" /></div><button type="button" onClick={() => setOpenSettings((current) => !current)} className={`grid size-10 shrink-0 place-items-center rounded-xl border transition ${openSettings ? "border-[var(--br-action)]/60 bg-[var(--br-action)]/15 text-[var(--br-action)]" : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"}`} aria-label="Audio settings" aria-expanded={openSettings}><Settings size={17} /></button></div>
      <div className="mt-3 flex items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => seek(-10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">−10 sec</button><button type="button" onClick={() => seek(10)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/15">+10 sec</button></div><label className="flex min-w-0 items-center gap-2 text-xs text-white/65"><Volume2 size={15} className="shrink-0" /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} className="w-20 accent-[var(--br-action)] sm:w-28" aria-label="Audio volume" /></label></div>
      {openSettings ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3 text-white/80">Playback speed<select value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }} className="rounded-lg border border-white/20 bg-dark px-2.5 py-1.5 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <p className="mt-2 text-xs text-white/55">Adjust playback without changing the original audio.</p>
        </div>
      ) : null}
    </div>
  );
}

function YouTubeAudioPlayer({ videoId }: { videoId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [openSettings, setOpenSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const src = useMemo(() => `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`, [videoId]);
  function command(func: string, args: unknown[] = []) { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }
  useEffect(() => { command("setVolume", [volume]); command("setPlaybackRate", [speed]); }, [volume, speed]);
  function toggle() { if (playing) { command("pauseVideo"); setPlaying(false); } else { command("playVideo"); setPlaying(true); } }
  function seek(seconds: number) { command("seekTo", [seconds, true]); }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-dark p-3 text-on-dark shadow-lg sm:p-4">
      <iframe ref={iframeRef} src={src} title="Audio source" className="pointer-events-none absolute size-px opacity-0" allow="autoplay; encrypted-media" />
      <div className="flex items-center gap-3"><button type="button" onClick={toggle} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--br-action)] text-on-dark shadow-md transition hover:scale-105" aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70"><span>{playing ? "Now playing" : "Ready to play"}</span><span>Audio source</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-1/3 rounded-full bg-[var(--br-action)]" /></div></div><button type="button" onClick={() => setOpenSettings((current) => !current)} className={`grid size-10 shrink-0 place-items-center rounded-xl border transition ${openSettings ? "border-[var(--br-action)]/60 bg-[var(--br-action)]/15 text-[var(--br-action)]" : "border-white/15 bg-white/10 text-white/75 hover:bg-white/15"}`} aria-label="Audio settings" aria-expanded={openSettings}><Settings size={17} /></button></div>
      <div className="mt-3 flex justify-end"><label className="flex items-center gap-2 text-xs text-white/65"><Volume2 size={15} /><input type="range" min="0" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-28 accent-[var(--br-action)]" aria-label="Audio volume" /></label></div>
      {openSettings ? (<div className="mt-3 rounded-xl border border-white/10 bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3 text-white/80">Playback speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-lg border border-white/20 bg-dark px-2.5 py-1.5 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label></div>) : null}
    </div>
  );
}

function parseTimeToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (!clean) return null;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean);
  }
  const parts = clean.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function formatPlayerTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function CustomYouTubeVideoPlayer({
  videoId,
  title,
  startTime,
  endTime
}: {
  videoId: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [openSettings, setOpenSettings] = useState(false);
  const [openVolume, setOpenVolume] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ended, setEnded] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guardStartupChrome, setGuardStartupChrome] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [viewportFullscreen, setViewportFullscreen] = useState(false);
  const [fullscreenOrientation, setFullscreenOrientation] = useState<"portrait" | "landscape" | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const chromeGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedPlayingRef = useRef(false);

  const fullscreenActive = nativeFullscreen || viewportFullscreen;

  const startSeconds = useMemo(() => parseTimeToSeconds(startTime) || 0, [startTime]);
  const endSeconds = useMemo(() => parseTimeToSeconds(endTime), [endTime]);

  const src = useMemo(() => {
    let url = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`;
    if (startSeconds > 0) url += `&start=${startSeconds}`;
    if (endSeconds !== null && endSeconds > startSeconds) url += `&end=${endSeconds}`;
    return url;
  }, [videoId, startSeconds, endSeconds]);

  function command(func: string, args: unknown[] = []) { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    if (playing) {
      controlsHideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        setOpenSettings(false);
        setOpenVolume(false);
      }, 4000);
    }
  }, [playing]);
  
  useEffect(() => {
    command("unMute");
    command("setVolume", [volume]);
    command("setPlaybackRate", [speed]);
  }, [volume, speed, playing]);

  useEffect(() => {
    wakeControls();
    return () => {
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    };
  }, [playing, wakeControls]);

  useEffect(() => {
    if (!loading && !playRequested) return;
    setControlsVisible(true);
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
  }, [loading, playRequested]);

  useEffect(() => {
    window.addEventListener("keydown", wakeControls);
    window.addEventListener("visibilitychange", wakeControls);
    return () => {
      window.removeEventListener("keydown", wakeControls);
      window.removeEventListener("visibilitychange", wakeControls);
    };
  }, [wakeControls]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !/^https:\/\/(www\.)?(youtube(-nocookie)?\.com|youtube\.com)$/.test(event.origin)) return;
      if (typeof event.data === "string") {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "infoDelivery" && data.info) {
            if (typeof data.info.currentTime === "number") {
              setCurrentTime(data.info.currentTime);
            }
            if (typeof data.info.duration === "number") {
              setDuration(data.info.duration);
            }
            if (typeof data.info.playerState === "number") {
              if (data.info.playerState === 1) {
                setPlaying(true);
                setStarted(true);
                setEnded(false);
                setPlayRequested(false);
                setLoading(false);
                if (!confirmedPlayingRef.current) {
                  setGuardStartupChrome(true);
                  if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                  chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
                }
                confirmedPlayingRef.current = true;
              } else if (data.info.playerState === 3) {
                setLoading(true);
                setControlsVisible(true);
              } else if (data.info.playerState === 2 || data.info.playerState === 0) {
                setPlaying(false);
                setPlayRequested(false);
                setLoading(false);
                confirmedPlayingRef.current = false;
                if (data.info.playerState === 0) setEnded(true);
              }
            }
          } else if (data.event === "onStateChange") {
            const state = Number(data.info);
            if (state === 1) {
              setPlaying(true);
                setStarted(true);
              setEnded(false);
              setPlayRequested(false);
              setLoading(false);
              if (!confirmedPlayingRef.current) {
                setGuardStartupChrome(true);
                if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
              }
              confirmedPlayingRef.current = true;
            } else if (state === 3) {
              setLoading(true);
              setControlsVisible(true);
            } else if (state === 2 || state === 0) {
              setPlaying(false);
              setPlayRequested(false);
              setLoading(false);
              confirmedPlayingRef.current = false;
              if (state === 0) setEnded(true);
            }
          }
        } catch (e) {
          // not JSON
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
      const active = activeElement === wrapperRef.current;
      setNativeFullscreen(active);
      if (!active && !viewportFullscreen) setFullscreenOrientation(null);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [viewportFullscreen]);

  useEffect(() => {
    if (!viewportFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewportFullscreen(false);
        setFullscreenOrientation(null);
        try {
          window.screen.orientation.unlock();
        } catch {
          // Orientation unlock is not available in every browser.
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewportFullscreen]);

  function toggle() {
    if (!started) setStarted(true);
    setEnded(false);
    if (playing) {
      command("pauseVideo");
      setPlaying(false);
      setPlayRequested(false);
      confirmedPlayingRef.current = false;
    } else {
      setLoading(true);
      setPlayRequested(true);
      command("playVideo");
      command("unMute");
      command("setVolume", [volume]);
      command("setPlaybackRate", [speed]);
    }
  }

  function restart() {
    if (!started) setStarted(true);
    setEnded(false);
    setLoading(true);
    setPlayRequested(true);
    command("seekTo", [startSeconds, true]);
    command("playVideo");
  }

  function seekRelative(seconds: number) {
    const targetTime = Math.max(startSeconds, Math.min(endSeconds || 99999, currentTime + seconds));
    command("seekTo", [targetTime, true]);
    setCurrentTime(targetTime);
  }

  async function lockOrientation(orientation: "portrait" | "landscape") {
    const orientationApi = window.screen.orientation as ScreenOrientation & { lock?: (value: "portrait" | "landscape") => Promise<void> };
    try {
      await orientationApi.lock?.(orientation);
    } catch {
      // Some mobile browsers only allow orientation changes through device controls.
    }
  }

  async function unlockOrientation() {
    try {
      window.screen.orientation.unlock();
    } catch {
      // Orientation unlock is not available in every browser.
    }
  }

  async function toggleFullscreen() {
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };

    if (fullscreenActive && fullscreenOrientation === "portrait") {
      setFullscreenOrientation("landscape");
      await lockOrientation("landscape");
      return;
    }

    if (fullscreenActive || document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await fullscreenDocument.webkitExitFullscreen?.();
      await unlockOrientation();
      setViewportFullscreen(false);
      setFullscreenOrientation(null);
      return;
    }

    const element = wrapperRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    if (!element) return;

    const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    const requestedOrientation = isMobile ? "portrait" : "landscape";
    setFullscreenOrientation(requestedOrientation);

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen({ navigationUI: "hide" });
        await lockOrientation(requestedOrientation);
        window.setTimeout(() => {
          const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
          if (activeElement !== wrapperRef.current) setViewportFullscreen(true);
        }, 150);
        return;
      }
      if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
        await lockOrientation(requestedOrientation);
        window.setTimeout(() => {
          const activeElement = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
          if (activeElement !== wrapperRef.current) setViewportFullscreen(true);
        }, 150);
        return;
      }
    } catch {
      // iPhone Safari and some in-app browsers reject element fullscreen.
    }

    setViewportFullscreen(true);
    await lockOrientation(requestedOrientation);
  }

  const controlClass = "relative grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/10 text-on-dark transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:size-9";
  const progressDuration = endSeconds && endSeconds > startSeconds ? endSeconds : duration;
  const progressValue = progressDuration > startSeconds ? Math.min(100, Math.max(0, ((currentTime - startSeconds) / (progressDuration - startSeconds)) * 100)) : 0;

  function seekFromProgress(event: ChangeEvent<HTMLInputElement>) {
    const target = Number(event.target.value);
    const nextTime = startSeconds + ((progressDuration - startSeconds) * target) / 100;
    command("seekTo", [nextTime, true]);
    setCurrentTime(nextTime);
  }

  return (
    <div
      ref={wrapperRef}
      onPointerDown={wakeControls}
      onContextMenu={(event) => event.preventDefault()}
      className={`relative bg-dark text-on-dark ${viewportFullscreen ? fullscreenOrientation === "landscape" ? "fixed left-1/2 top-1/2 z-[9999] flex h-[100vw] w-[100vh] -translate-x-1/2 -translate-y-1/2 rotate-90 flex-col overflow-hidden rounded-none" : "fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-hidden rounded-none" : nativeFullscreen ? "flex h-[100dvh] w-screen flex-col overflow-hidden rounded-none" : "overflow-hidden rounded-lg"}`}
    >
      <div className={`relative overflow-hidden bg-black ${fullscreenActive ? "min-h-0 flex-1" : "aspect-video"}`}>
        <div className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/35 to-transparent px-3 pb-8 pt-3 text-white transition-opacity duration-300 sm:px-5 sm:pt-4 ${controlsVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="min-w-0 pr-4">
            <p className="truncate text-sm font-bold sm:text-base">{title || "Lesson video"}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">BrenUp player</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-black/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">Video</span>
        </div>
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className={`pointer-events-none absolute inset-0 h-full w-full transition duration-300 ${started ? "opacity-100" : "opacity-0"}`}
          style={{ transform: "scale(1.01)" }}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => {
            setControlsVisible(true);
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*");
          }}
        />
        {playing && guardStartupChrome ? <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-black via-black/80 to-transparent" /> : null}
        {!playing ? (
          <div
            className="absolute inset-0 z-10 bg-black/45 bg-cover bg-center"
            style={{ backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(https://img.youtube.com/vi/${videoId}/hqdefault.jpg)` }}
          />
        ) : null}
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            wakeControls();
            toggle();
          }}
          aria-label={playing ? "Pause video" : ended ? "Replay video" : "Play video"}
          className="pointer-events-auto absolute left-1/2 top-1/2 z-40 grid size-16 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full bg-transparent text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 sm:size-[4.5rem]"
        >
          {playing ? null : playRequested ? <span className="size-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : ended ? <RotateCcw size={24} /> : <Play size={24} className="ml-0.5" />}
        </button>
        <div className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-2 pb-2 pt-12 transition-opacity duration-300 sm:px-4 sm:pb-3 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="mb-1 flex items-center gap-2 px-1 text-[10px] font-semibold tabular-nums text-white/80">
            <span>{formatPlayerTime(currentTime)}</span>
            <input type="range" min="0" max="100" step="0.1" value={progressValue} onChange={seekFromProgress} aria-label="Video progress" className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--br-brand)]" />
            <span>{formatPlayerTime(progressDuration)}</span>
          </div>
          <div className="flex items-center justify-center gap-1 overflow-visible sm:gap-2">
            <button type="button" onClick={toggle} className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-ink shadow-sm transition hover:bg-[var(--br-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:size-9">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" onClick={() => seekRelative(-10)} className={controlClass} aria-label="Rewind 10 seconds" title="Rewind 10 seconds"><SkipBack size={16} /></button>
            <button type="button" onClick={() => seekRelative(10)} className={controlClass} aria-label="Forward 10 seconds" title="Forward 10 seconds"><SkipForward size={16} /></button>
            <button type="button" onClick={restart} className={controlClass} aria-label="Restart video" title="Restart video"><RotateCcw size={16} /></button>
            <div className="relative z-30 shrink-0">
              <button type="button" onClick={() => setOpenVolume((current) => !current)} className={controlClass} aria-label="Volume" title="Volume"><Volume2 size={16} /></button>
              {openVolume ? (<div className="absolute bottom-12 right-0 rounded-lg border border-white/10 bg-dark/95 p-3 shadow-xl"><input aria-label="Volume" type="range" min="0" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="h-24 w-6 [writing-mode:vertical-rl]" /></div>) : null}
            </div>
            <button type="button" onClick={() => void toggleFullscreen()} className={controlClass} aria-label={fullscreenOrientation === "landscape" ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreenOrientation === "landscape" ? "Exit fullscreen" : "Fullscreen"}>{fullscreenOrientation === "landscape" ? <Minimize size={16} /> : <Maximize size={16} />}</button>
            <button type="button" onClick={() => setOpenSettings((current) => !current)} className={controlClass} aria-label="Video settings" title="Video settings"><Settings size={16} /></button>
          </div>
        </div>
      </div>
      {openSettings ? (
        <div role="dialog" aria-label="Video settings" className="absolute bottom-16 right-3 z-50 w-48 rounded-xl border border-[var(--br-border)] bg-white p-3 text-sm text-[var(--br-text)] shadow-2xl">
          <label className="flex items-center justify-between gap-3 font-semibold">Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-lg border border-[var(--br-border)] bg-white px-2 py-1 text-[var(--br-text)]">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{fullscreenActive ? "Video is fullscreen" : "Video is not fullscreen"}</p>
    </div>
  );
}

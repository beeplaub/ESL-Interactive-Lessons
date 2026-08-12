"use client";

import { BookOpen, FlipHorizontal2, Headphones, ImageIcon, ListChecks, Maximize, Minimize, MessageSquareQuote, Pause, Play, PlayCircle, Settings, Volume2, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "@/types/database.types";

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
  emptyText = "No editable blocks yet. Add content blocks to preview the future LMS lesson view."
}: {
  blocks: PreviewLessonBlock[];
  emptyText?: string;
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
        <PreviewBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

function PreviewBlock({ block }: { block: PreviewLessonBlock }) {
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

  if (block.block_type === "BULLETS") {
    const items = asArray(content.items).map(String).filter(Boolean);
    return (
      <div className="rounded-lg border border-[var(--br-border)] bg-surface p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <ListChecks size={18} className="text-moss" /> {asString(content.title) || "Key points"}
        </div>
        {items.length ? (
          <ul className="space-y-2 text-base leading-6 text-[var(--br-text-muted)]">
            {items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-moss" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--br-text-muted)]">Add bullet points.</p>
        )}
      </div>
    );
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
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <MessageSquareQuote className="mt-0.5 shrink-0 text-amber-700" size={18} />
          <div className={align}>
            {asString(content.title) ? <h3 className="font-semibold text-amber-950">{asString(content.title)}</h3> : null}
            <p className="mt-1 text-base leading-6 text-amber-900">{asString(content.body) || "Add a callout message."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (block.block_type === "IMAGE") {
    const path = asString(content.path);
    const src = mediaUrl(path, "image");
    return (
      <figure className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface-muted">
        {path && isImageUrl(path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={asString(content.alt) || ""} className="max-h-[520px] w-full object-contain" />
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

  if (block.block_type === "IMAGE_TEXT") {
    const imagePath = asString(content.image_path);
    const src = imagePath ? mediaUrl(imagePath, "image") : "";
    const imageRight = asString(content.image_position) === "right";
    const heading = asString(content.heading);
    const body = asString(content.body);
    const caption = asString(content.caption);
    const alt = asString(content.alt);

    const imageCol = (
      <figure className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted">
        {src && isImageUrl(src) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt || heading || ""} className="h-full max-h-[340px] w-full object-cover" />
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

  if (block.block_type === "AUDIO") {
    const path = asString(content.path);
    const src = mediaUrl(path, "audio");
    const youtubeId = getYouTubeId(path);
    return (
      <div className="rounded-lg border border-[var(--br-border)] bg-dark p-3 text-on-dark sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Headphones size={18} /> {asString(content.label) || "Audio"}
        </div>
        {youtubeId ? (
          <YouTubeAudioPlayer videoId={youtubeId} />
        ) : path && /^https?:\/\//i.test(path) ? (
          <CustomAudioPlayer src={src} />
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
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h3 className="font-semibold text-ink">{asString(content.title) || "Grammar focus"}</h3>
        <div className="mt-2"><FormattedText text={asString(content.explanation) || "Add a grammar explanation."} /></div>
        {asArray(content.examples).length ? (
          <ul className="mt-3 space-y-2 text-base text-[var(--br-text-muted)]">
            {asArray(content.examples).map((example, index) => (
              <li key={index} className="rounded-md bg-surface px-3 py-2">{String(example)}</li>
            ))}
          </ul>
        ) : null}
        {asString(content.notes) ? <div className="mt-3 text-xs text-[var(--br-text-muted)]"><FormattedText text={asString(content.notes)} /></div> : null}
      </div>
    );
  }

  if (block.block_type === "READING") {
    return (
      <article className="rounded-lg border border-[var(--br-border)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen size={18} className="text-moss" />
          <h3 className="font-semibold">{asString(content.title) || "Reading passage"}</h3>
        </div>
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

  if (block.block_type === "TABLE") {
    return <TableBlock content={content} />;
  }

  return null;
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
  function toggle() { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); } else { audio.pause(); } }
  function seek(seconds: number) { const audio = audioRef.current; if (!audio) return; audio.currentTime = Math.max(0, audio.currentTime + seconds); }
  return (
    <div className="rounded-lg bg-white/10 p-3">
      <audio ref={audioRef} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => seek(-10)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">-10s</button>
        <button type="button" onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-surface px-4 py-2 text-sm font-semibold text-ink">{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={() => seek(10)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">+10s</button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70"><Volume2 size={15} /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} /></label>
        <button type="button" onClick={() => setOpenSettings((current) => !current)} className="rounded-md bg-white/10 p-2 hover:bg-white/20" aria-label="Audio settings"><Settings size={16} /></button>
      </div>
      {openSettings ? (
        <div className="mt-3 rounded-md bg-white/10 p-3 text-sm">
          <label className="flex items-center justify-between gap-3">Speed<select value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }} className="rounded-md border border-white/20 bg-dark px-2 py-1 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          <p className="mt-2 text-xs text-white/55">Audio quality depends on the source link.</p>
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
    <div className="relative rounded-lg bg-white/10 p-3">
      <iframe ref={iframeRef} src={src} title="Audio source" className="pointer-events-none absolute size-px opacity-0" allow="autoplay; encrypted-media" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => seek(0)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">Start</button>
        <button type="button" onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-surface px-4 py-2 text-sm font-semibold text-ink">{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play"}</button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70"><Volume2 size={15} /><input type="range" min="0" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
        <button type="button" onClick={() => setOpenSettings((current) => !current)} className="rounded-md bg-white/10 p-2 hover:bg-white/20" aria-label="Audio settings"><Settings size={16} /></button>
      </div>
      {openSettings ? (<div className="mt-3 rounded-md bg-white/10 p-3 text-sm"><label className="flex items-center justify-between gap-3">Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-md border border-white/20 bg-dark px-2 py-1 text-on-dark">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label></div>) : null}
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
                if (!confirmedPlayingRef.current) {
                  setGuardStartupChrome(true);
                  if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                  chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
                }
                confirmedPlayingRef.current = true;
              } else if (data.info.playerState === 2 || data.info.playerState === 0) {
                setPlaying(false);
                setPlayRequested(false);
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
              if (!confirmedPlayingRef.current) {
                setGuardStartupChrome(true);
                if (chromeGuardTimerRef.current) clearTimeout(chromeGuardTimerRef.current);
                chromeGuardTimerRef.current = setTimeout(() => setGuardStartupChrome(false), 3500);
              }
              confirmedPlayingRef.current = true;
            } else if (state === 2 || state === 0) {
              setPlaying(false);
              setPlayRequested(false);
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
          onLoad={() => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*")}
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
          className="pointer-events-auto absolute left-1/2 top-1/2 z-40 grid size-9 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center bg-transparent text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 sm:size-10"
        >
          {playRequested ? <span className="size-4 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : playing ? <Pause size={20} /> : ended ? <RotateCcw size={20} /> : <Play size={20} className="ml-0.5" />}
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

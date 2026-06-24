"use client";

import { BookOpen, FlipHorizontal2, Headphones, ImageIcon, ListChecks, Maximize, MessageSquareQuote, Pause, Play, PlayCircle, Settings, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
      <div className="rounded-lg border border-dashed border-black/15 bg-white p-6 text-center text-sm text-black/50">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
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
    if (level === "H1") return <h1 className="text-3xl font-semibold tracking-tight text-ink">{text}</h1>;
    if (level === "H3") return <h3 className="text-lg font-semibold text-ink">{text}</h3>;
    if (level === "H4") return <h4 className="text-base font-semibold text-ink">{text}</h4>;
    return <h2 className="text-2xl font-semibold tracking-tight text-ink">{text}</h2>;
  }

  if (block.block_type === "TEXT") {
    return <FormattedText text={asString(content.body)} />;
  }

  if (block.block_type === "BULLETS") {
    const items = asArray(content.items).map(String).filter(Boolean);
    return (
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <ListChecks size={18} className="text-moss" /> {asString(content.title) || "Key points"}
        </div>
        {items.length ? (
          <ul className="space-y-2 text-sm leading-6 text-black/70">
            {items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-moss" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-black/50">Add bullet points.</p>
        )}
      </div>
    );
  }

  if (block.block_type === "QUOTE") {
    return (
      <figure className="rounded-lg border-l-4 border-moss bg-skywash p-4">
        <blockquote className="text-lg font-medium leading-8 text-ink">
          “{asString(content.body) || "Add a quote."}”
        </blockquote>
        {asString(content.attribution) ? (
          <figcaption className="mt-2 text-sm text-black/55">— {asString(content.attribution)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "CALLOUT") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <MessageSquareQuote className="mt-0.5 shrink-0 text-amber-700" size={18} />
          <div>
            {asString(content.title) ? <h3 className="font-semibold text-amber-950">{asString(content.title)}</h3> : null}
            <p className="mt-1 text-sm leading-6 text-amber-900">{asString(content.body) || "Add a callout message."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (block.block_type === "IMAGE") {
    const path = asString(content.path);
    const src = mediaUrl(path, "image");
    return (
      <figure className="overflow-hidden rounded-lg border border-black/10 bg-slate-50">
        {path && isImageUrl(path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={asString(content.alt) || ""} className="max-h-80 w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center text-sm text-black/45">
            <div className="text-center">
              <ImageIcon className="mx-auto mb-2" size={24} />
              {path || "Add an image URL or storage path."}
            </div>
          </div>
        )}
        {asString(content.caption) ? (
          <figcaption className="border-t border-black/10 px-4 py-2 text-sm text-black/55">{asString(content.caption)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.block_type === "AUDIO") {
    const path = asString(content.path);
    const src = mediaUrl(path, "audio");
    const youtubeId = getYouTubeId(path);
    return (
      <div className="rounded-lg border border-black/10 bg-ink p-4 text-white">
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
      <div className="overflow-hidden rounded-lg border border-black/10 bg-slate-50">
        {youtubeId ? (
          <CustomYouTubeVideoPlayer videoId={youtubeId} title={asString(content.title) || "Lesson video"} />
        ) : (
          <div className="grid aspect-video place-items-center p-4 text-center">
            <div>
              <PlayCircle size={28} className="mx-auto text-moss" />
              <p className="mt-2 font-semibold">{asString(content.title) || "Video"}</p>
              <p className="mt-1 break-all text-sm text-black/55">{url || "Add a YouTube or video URL."}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (block.block_type === "DIVIDER") {
    return <hr className="border-black/10" />;
  }

  if (block.block_type === "VOCABULARY") {
    const entries = asArray(content.entries);
    return (
      <div className="rounded-lg border border-black/10">
        <div className="border-b border-black/10 bg-slate-50 px-4 py-3">
          <h3 className="font-semibold">Vocabulary</h3>
        </div>
        <div className="divide-y divide-black/10">
          {entries.length ? entries.map((item, index) => {
            const entry = asRecord(item as Json);
            return (
              <div key={index} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]">
                <div>
                  <p className="font-semibold text-ink">{asString(entry.word) || "Word"}</p>
                  {asString(entry.pronunciation) ? <p className="text-xs text-black/45">{asString(entry.pronunciation)}</p> : null}
                </div>
                <div className="text-sm leading-6 text-black/65">
                  <p>{asString(entry.meaning) || "Meaning"}</p>
                  {asString(entry.example) ? <p className="mt-1 italic text-black/55">{asString(entry.example)}</p> : null}
                  {asString(entry.notes) ? <p className="mt-1 text-xs text-black/45">{asString(entry.notes)}</p> : null}
                </div>
              </div>
            );
          }) : <p className="p-4 text-sm text-black/50">Add vocabulary entries.</p>}
        </div>
      </div>
    );
  }

  if (block.block_type === "GRAMMAR") {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h3 className="font-semibold text-ink">{asString(content.title) || "Grammar focus"}</h3>
        <p className="mt-2 text-sm leading-6 text-black/65">{asString(content.explanation) || "Add a grammar explanation."}</p>
        {asArray(content.examples).length ? (
          <ul className="mt-3 space-y-2 text-sm text-black/70">
            {asArray(content.examples).map((example, index) => (
              <li key={index} className="rounded-md bg-white px-3 py-2">{String(example)}</li>
            ))}
          </ul>
        ) : null}
        {asString(content.notes) ? <p className="mt-3 text-xs text-black/50">{asString(content.notes)}</p> : null}
      </div>
    );
  }

  if (block.block_type === "READING") {
    return (
      <article className="rounded-lg border border-black/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen size={18} className="text-moss" />
          <h3 className="font-semibold">{asString(content.title) || "Reading passage"}</h3>
        </div>
        <FormattedText text={asString(content.passage) || "Add a reading passage."} />
        {asArray(content.questions).length ? (
          <div className="mt-4 rounded-md bg-slate-50 p-3">
            <p className="text-sm font-semibold">Questions</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-black/65">
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
    return (
      <div className="space-y-2">
        {asString(content.title) ? <h3 className="font-semibold text-ink">{asString(content.title)}</h3> : null}
        {turns.length ? turns.map((item, index) => {
          const turn = asRecord(item as Json);
          return (
            <div key={index} className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-moss">{asString(turn.speaker) || "Speaker"}</p>
              <p className="mt-1 text-sm leading-6 text-black/70">{asString(turn.line) || "Dialogue line"}</p>
            </div>
          );
        }) : <p className="rounded-lg border border-dashed border-black/15 p-4 text-sm text-black/50">Add dialogue turns.</p>}
      </div>
    );
  }

  if (block.block_type === "FLASHCARD") {
    return <FlashcardBlock content={content} />;
  }

  return null;
}

function FlashcardBlock({ content }: { content: Record<string, unknown> }) {
  const [flipped, setFlipped] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const imagePath = asString(content.image_path);
  const word      = asString(content.word);
  const phonetic  = asString(content.phonetic);
  const audioPath = asString(content.audio_path);
  const meaning   = asString(content.meaning);
  const examples  = asArray(content.examples).map(String).filter(Boolean);

  const imageSrc = imagePath ? mediaUrl(imagePath, "image") : "";
  const audioSrc = audioPath ? mediaUrl(audioPath, "audio") : "";

  return (
    <div className="w-full select-none" style={{ perspective: "1200px" }}>
      <div
        className="relative w-full transition-all duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: "300px",
        }}
      >
        {/* FRONT: image face */}
        <div
          className="absolute inset-0 cursor-pointer overflow-hidden rounded-2xl"
          style={{ backfaceVisibility: "hidden", minHeight: "300px" }}
          onClick={() => setFlipped(true)}
          role="button"
          aria-label="Flip card to reveal the word"
        >
          {imageSrc && isImageUrl(imageSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={word || "Flashcard image"}
              className="h-full w-full object-cover"
              style={{ minHeight: "300px" }}
            />
          ) : (
            <div className="grid min-h-[300px] place-items-center rounded-2xl bg-slate-100 text-black/25">
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageIcon size={40} />
                <p className="text-sm">Add an image to display here</p>
              </div>
            </div>
          )}
          {imageSrc && isImageUrl(imageSrc) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-2xl bg-gradient-to-t from-black/50 to-transparent" />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFlipped(true); }}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/60"
            aria-label="Flip card"
          >
            <FlipHorizontal2 size={12} /> Flip
          </button>
        </div>

        {/* BACK: word details face */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", minHeight: "300px" }}
        >
          {audioSrc && <audio ref={audioRef} src={audioSrc} preload="none" />}

          <p className="text-3xl font-bold leading-tight tracking-tight text-ink">
            {word || "Word"}
          </p>

          {(phonetic || audioSrc) && (
            <div className="flex items-center justify-center gap-2">
              {phonetic && <span className="font-mono text-sm text-black/45">{phonetic}</span>}
              {audioSrc && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (audioRef.current) {
                      audioRef.current.currentTime = 0;
                      void audioRef.current.play();
                    }
                  }}
                  title="Play pronunciation"
                  className="flex items-center justify-center rounded-full bg-moss/10 p-1.5 text-moss transition hover:bg-moss/20 active:scale-95"
                >
                  <Volume2 size={15} />
                </button>
              )}
            </div>
          )}

          <div className="w-12 border-t border-black/10" />

          <p className="max-w-xs text-base leading-relaxed text-black/70">
            {meaning || "Meaning"}
          </p>

          {examples.length > 0 && (
            <div className="max-w-xs space-y-1">
              {examples.map((ex, i) => (
                <p key={i} className="text-sm italic leading-relaxed text-black/45">
                  &ldquo;{ex}&rdquo;
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setFlipped(false)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/50 shadow-sm transition hover:bg-black/5 hover:text-black"
            aria-label="Flip back"
          >
            <FlipHorizontal2 size={12} /> Flip back
          </button>
        </div>
      </div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return <p className="text-sm text-black/50">Add text.</p>;
  return (
    <div className="space-y-3 text-sm leading-7 text-black/70">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function CustomAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [openSettings, setOpenSettings] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
  }

  return (
    <div className="rounded-lg bg-white/10 p-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => seek(-10)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">
          -10s
        </button>
        <button type="button" onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink">
          {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => seek(10)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">
          +10s
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70">
          <Volume2 size={15} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              if (audioRef.current) audioRef.current.volume = next;
            }}
          />
        </label>
        <button type="button" onClick={() => setOpenSettings((current) => !current)} className="rounded-md bg-white/10 p-2 hover:bg-white/20" aria-label="Audio settings">
          <Settings size={16} />
        </button>
      </div>
      {openSettings ? (
        <div className="mt-3 rounded-md bg-white/10 p-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Speed
            <select
              value={speed}
              onChange={(event) => {
                const next = Number(event.target.value);
                setSpeed(next);
                if (audioRef.current) audioRef.current.playbackRate = next;
              }}
              className="rounded-md border border-white/20 bg-ink px-2 py-1 text-white"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
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
  const src = useMemo(
    () => `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`,
    [videoId]
  );

  function command(func: string, args: unknown[] = []) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }

  useEffect(() => {
    command("setVolume", [volume]);
    command("setPlaybackRate", [speed]);
  }, [volume, speed]);

  function toggle() {
    if (playing) {
      command("pauseVideo");
      setPlaying(false);
    } else {
      command("playVideo");
      setPlaying(true);
    }
  }

  function seek(seconds: number) {
    command("seekTo", [seconds, true]);
  }

  return (
    <div className="relative rounded-lg bg-white/10 p-3">
      <iframe
        ref={iframeRef}
        src={src}
        title="Audio source"
        className="pointer-events-none absolute size-px opacity-0"
        allow="autoplay; encrypted-media"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => seek(0)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">
          Start
        </button>
        <button type="button" onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-ink">
          {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play"}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70">
          <Volume2 size={15} />
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={() => setOpenSettings((current) => !current)} className="rounded-md bg-white/10 p-2 hover:bg-white/20" aria-label="Audio settings">
          <Settings size={16} />
        </button>
      </div>
      {openSettings ? (
        <div className="mt-3 rounded-md bg-white/10 p-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Speed
            <select
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              className="rounded-md border border-white/20 bg-ink px-2 py-1 text-white"
            >
              {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function CustomYouTubeVideoPlayer({ videoId, title }: { videoId: string; title: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [openSettings, setOpenSettings] = useState(false);
  const [openVolume, setOpenVolume] = useState(false);
  const [speed, setSpeed] = useState(1);
  const src = useMemo(
    () => `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`,
    [videoId]
  );

  function command(func: string, args: unknown[] = []) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }

  useEffect(() => {
    command("setVolume", [volume]);
    command("setPlaybackRate", [speed]);
  }, [volume, speed]);

  function toggle() {
    if (!started) setStarted(true);
    if (playing) {
      command("pauseVideo");
      setPlaying(false);
    } else {
      command("playVideo");
      setPlaying(true);
    }
  }

  function restart() {
    if (!started) setStarted(true);
    command("seekTo", [0, true]);
    command("playVideo");
    setPlaying(true);
  }

  function fullscreen() {
    void wrapperRef.current?.requestFullscreen?.();
  }

  return (
    <div ref={wrapperRef} className="overflow-hidden rounded-lg bg-ink text-white">
      <div className="relative aspect-video bg-black">
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className={`h-full w-full ${started ? "opacity-100" : "opacity-0"}`}
          allow="autoplay; encrypted-media; picture-in-picture"
        />
        {!started ? (
          <button type="button" onClick={toggle} className="absolute inset-0 grid place-items-center bg-ink text-white">
            <span className="grid size-16 place-items-center rounded-full bg-white text-ink shadow-xl">
              <Play size={26} />
            </span>
            <span className="sr-only">Play video</span>
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto p-2">
        <button type="button" onClick={toggle} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-ink">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={restart} className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20">
          Restart
        </button>
        <div className="relative ml-auto shrink-0">
          <button type="button" onClick={() => setOpenVolume((current) => !current)} className="rounded-md bg-white/10 p-1.5 hover:bg-white/20" aria-label="Volume">
            <Volume2 size={15} />
          </button>
          {openVolume ? (
            <div className="absolute bottom-9 right-0 rounded-md bg-ink/95 p-3 shadow-xl">
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="100"
                step="5"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="h-24 w-6 [writing-mode:vertical-rl]"
              />
            </div>
          ) : null}
        </div>
        <button type="button" onClick={fullscreen} className="shrink-0 rounded-md bg-white/10 p-1.5 hover:bg-white/20" aria-label="Fullscreen">
          <Maximize size={15} />
        </button>
        <button type="button" onClick={() => setOpenSettings((current) => !current)} className="shrink-0 rounded-md bg-white/10 p-1.5 hover:bg-white/20" aria-label="Video settings">
          <Settings size={15} />
        </button>
      </div>
      {openSettings ? (
        <div className="border-t border-white/10 p-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Speed
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-md border border-white/20 bg-ink px-2 py-1 text-white">
              {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

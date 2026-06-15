import { BookOpen, Headphones, ImageIcon, MessageSquareQuote, PlayCircle } from "lucide-react";
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

function getYouTubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.youtube.com/embed/${id}` : "";
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
    return <h2 className="text-2xl font-semibold tracking-tight text-ink">{text}</h2>;
  }

  if (block.block_type === "TEXT") {
    return <FormattedText text={asString(content.body)} />;
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
    return (
      <figure className="overflow-hidden rounded-lg border border-black/10 bg-slate-50">
        {path && isImageUrl(path) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={path} alt={asString(content.alt) || ""} className="max-h-80 w-full object-cover" />
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
    return (
      <div className="rounded-lg border border-black/10 bg-ink p-4 text-white">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Headphones size={18} /> {asString(content.label) || "Audio"}
        </div>
        {path && /^https?:\/\//i.test(path) ? (
          <audio controls src={path} className="w-full">
            <track kind="captions" />
          </audio>
        ) : (
          <p className="text-sm text-white/65">{path || "Add an audio URL or storage path."}</p>
        )}
      </div>
    );
  }

  if (block.block_type === "VIDEO") {
    const url = asString(content.url);
    const embedUrl = getYouTubeEmbedUrl(url);
    return (
      <div className="overflow-hidden rounded-lg border border-black/10 bg-slate-50">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={asString(content.title) || "Video"}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="grid aspect-video place-items-center p-4 text-center">
            <div>
              <PlayCircle size={28} className="mx-auto text-moss" />
              <p className="mt-2 font-semibold">{asString(content.title) || "Video"}</p>
              <p className="mt-1 break-all text-sm text-black/55">{url || "Add a YouTube or video URL."}</p>
            </div>
          </div>
        )}
        {asString(content.title) && embedUrl ? (
          <div className="border-t border-black/10 px-4 py-2 text-sm font-medium">{asString(content.title)}</div>
        ) : null}
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

  return null;
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, isStaff } from "@/lib/auth";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import { BrandLogo } from "@/components/BrandLogo";
import type { Json } from "@/types/database.types";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";
import { parseAudioTracks } from "@/lib/audioTracks";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

type PrintableSlide = {
  id: string;
  slide_number: number;
  title: string;
  section_label: string | null;
};

type PrintableBlock = PreviewLessonBlock & { slide_id: string };

type PrintableActivity = {
  id: string;
  slide_id: string | null;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
};

type PrintableAudio = {
  id: string;
  slide_id: string | null;
  label: string | null;
  url: string;
  qrDataUrl: string;
};

function record(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function printableAudioUrl(value: unknown) {
  const source = text(value).trim();
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return source;

  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (base) {
    const normalized = source.replace(/^\/+/, "");
    const key = /^(lessons|lesson-audio|ai-recordings)\//i.test(normalized)
      ? normalized
      : `lesson-audio/${normalized}`;
    return `${base}/${encodeURI(key).replace(/%2F/g, "/")}`;
  }

  // A relative public media route is still scannable when converted to an
  // absolute URL. R2 is preferred above for all managed media keys.
  try {
    return new URL(source, process.env.NEXT_PUBLIC_SITE_URL || "https://www.brenup.com").toString();
  } catch {
    return null;
  }
}

function activityPrompt(activity: PrintableActivity) {
  const data = record(activity.activity_data);
  return text(data.question_text) || text(data.prompt) || text(data.instructions) || text(data.question) || "Complete the activity.";
}

function activityChoices(activity: PrintableActivity) {
  const data = record(activity.activity_data);
  const options = data.options;
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return Object.values(options).map(text).filter(Boolean);
  }
  return strings(data.choices ?? data.items ?? data.statements);
}

function PrintableAudio({ audio }: { audio: PrintableAudio }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3 print:bg-white">
      <img src={audio.qrDataUrl} alt="Scan to play audio" className="size-28 shrink-0" style={{ imageRendering: "pixelated" }} />
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Audio</p>
        <p className="mt-1 text-sm font-bold text-[var(--br-dark-card)]">{audio.label || "Listen to this slide"}</p>
        <p className="mt-1 break-all text-[10px] leading-4 text-[var(--br-text-muted)]">Scan the code to play</p>
      </div>
    </div>
  );
}

function PrintableActivity({ activity, index }: { activity: PrintableActivity; index: number }) {
  const choices = activityChoices(activity);
  const type = activity.activity_type.replaceAll("_", " ");
  const answerLines = activity.activity_type === "MCQ" || activity.activity_type === "TRUE_FALSE" || activity.activity_type === "MULTIPLE_SELECT" ? 0 : activity.activity_type === "SHORT_ANSWER" ? 4 : 2;

  return (
    <section className="print-activity break-inside-avoid rounded-[14px] border border-[var(--br-border)] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--br-dark-card)] text-xs font-extrabold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold capitalize text-[var(--br-dark-card)]">{type}</h4>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--br-text-muted)]">Practice</span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--br-text)]">{activityPrompt(activity)}</p>
          {choices.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {choices.map((choice, choiceIndex) => (
                <div key={`${choice}-${choiceIndex}`} className="flex items-start gap-2 text-sm leading-5 text-[var(--br-text)]">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-[var(--br-border)] text-[9px] font-bold text-[var(--br-text-muted)]">{String.fromCharCode(65 + choiceIndex)}</span>
                  <span>{choice}</span>
                </div>
              ))}
            </div>
          ) : null}
          {activity.activity_type === "TRUE_FALSE" ? (
            <div className="mt-3 flex gap-6 text-sm text-[var(--br-text)]"><span>□ True</span><span>□ False</span></div>
          ) : null}
          {answerLines ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: answerLines }, (_, lineIndex) => <div key={lineIndex} className="h-5 border-b border-dashed border-[var(--br-border)]" />)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function LessonPrintPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const [{ data: lesson }, { data: slides }, { data: blocks }, { data: activities }, { data: audioFiles }] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status,created_by").eq("id", lessonId).is("deleted_at", null).maybeSingle(),
    admin.from("slides").select("id,slide_number,title,section_label").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("lesson_audio_files").select("id,slide_id,label,storage_path,storage_provider,storage_bucket,public_url,external_url").eq("lesson_id", lessonId),
  ]);

  if (!lesson) notFound();
  const canPrint = isStaff(profile?.role) || lesson.status === "PUBLISHED";
  if (!canPrint) notFound();

  const slideList = (slides ?? []) as PrintableSlide[];
  const blockList = (blocks ?? []) as PrintableBlock[];
  const activityList = (activities ?? []) as PrintableActivity[];
  const audioList = (await Promise.all((audioFiles ?? []).map(async (audio) => {
    const url = audio.external_url || (audio.storage_provider === "r2"
      ? printableAudioUrl(audio.public_url || audio.storage_path)
      : await resolveMediaUrl(admin, {
          provider: audio.storage_provider,
          bucket: audio.storage_bucket ?? "lesson-audio",
          path: audio.storage_path,
          publicUrl: audio.public_url,
        }));
    if (!url) return null;
    return { id: audio.id, slide_id: audio.slide_id, label: audio.label, url, qrDataUrl: await QRCode.toDataURL(url, { margin: 2, width: 240, errorCorrectionLevel: "M" }) } satisfies PrintableAudio;
  }))).filter((audio): audio is PrintableAudio => Boolean(audio));
  const audioBlockList = (await Promise.all(blockList.filter((block) => block.block_type === "AUDIO").flatMap((block) => {
    const content = record(block.content);
    const title = text(content.title) || "Audio";
    const source = content.path ?? content.audio_url ?? content.audioUrl ?? content.url;
    const tracks = parseAudioTracks(source).tracks;
    return tracks.map((track, index) => ({ block, title: tracks.length > 1 ? `${title} ${index + 1}` : title, url: track.url }));
  }).map(async ({ block, title, url }, index): Promise<PrintableAudio | null> => {
    const resolvedUrl = printableAudioUrl(url) || await resolveMediaUrl(admin, { provider: "r2", bucket: "lesson-audio", path: url });
    if (!resolvedUrl) return null;
    return { id: `${block.id}-${index}`, slide_id: block.slide_id, label: title, url: resolvedUrl, qrDataUrl: await QRCode.toDataURL(resolvedUrl, { margin: 2, width: 240, errorCorrectionLevel: "M" }) } satisfies PrintableAudio;
  }))).filter((audio): audio is PrintableAudio => Boolean(audio));

  return (
    <div className="min-h-screen bg-[var(--br-canvas)] text-[var(--br-text)] print:bg-white">
      <div className="print-toolbar border-b border-[var(--br-border)] bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href={`/lessons/${lessonId}`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-[var(--br-text)] hover:bg-[var(--br-surface-muted)]"><ArrowLeft size={16} /> Back to lesson</Link>
          <button type="button" data-trigger-print="true" className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-action)] px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:opacity-90"><Printer size={16} /> Print / Save PDF</button>
        </div>
      </div>

      <main className="print-document mx-auto max-w-5xl px-3 py-5 sm:px-6 sm:py-8 print:max-w-none print:px-0 print:py-0">
        <header className="print-cover border-b-2 border-[var(--br-dark-card)] pb-5 print:mb-5">
          <BrandLogo variant="light" className="h-10 w-[136px]" />
          <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--br-action)]">Lesson workbook</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-tight text-[var(--br-dark-card)] sm:text-4xl">{lesson.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[var(--br-text-muted)]">
                {lesson.topic ? <span>{lesson.topic}</span> : null}
                {lesson.level ? <span>{lesson.level}</span> : null}
                <span>{slideList.length} slides</span>
              </div>
            </div>
            <div className="grid min-w-[190px] gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-4 text-sm print:min-w-[180px] print:bg-white">
              <div className="flex items-end gap-2"><strong className="text-xs uppercase tracking-wide text-[var(--br-text-muted)]">Name</strong><span className="h-5 flex-1 border-b border-dashed border-[var(--br-border)]" /></div>
              <div className="flex items-end gap-2"><strong className="text-xs uppercase tracking-wide text-[var(--br-text-muted)]">Date</strong><span className="h-5 flex-1 border-b border-dashed border-[var(--br-border)]" /></div>
            </div>
          </div>
        </header>

        <div className="print-slides mt-6 space-y-8 print:mt-0 print:space-y-0">
          {slideList.map((slide) => {
            const slideBlocks = blockList.filter((block) => block.slide_id === slide.id && block.block_type !== "AUDIO").sort((a, b) => a.position - b.position);
            const slideActivities = activityList.filter((activity) => activity.slide_id === slide.id || (!activity.slide_id && activity.slide_number === slide.slide_number));
            return (
              <article key={slide.id} className="print-slide rounded-[18px] border border-[var(--br-border)] bg-white p-4 shadow-sm sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
                <div className="mb-5 border-b border-[var(--br-border)] pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--br-action)]">Slide {slide.slide_number}</p>
                    {slide.section_label ? <span className="text-xs font-bold text-[var(--br-text-muted)]">{slide.section_label}</span> : null}
                  </div>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--br-dark-card)]">{slide.title}</h2>
                </div>
                {slideBlocks.length ? <div className="print-blocks"><LessonBlockPreview blocks={slideBlocks} emptyText="" alwaysOpen /></div> : null}
                {audioList.filter((audio) => audio.slide_id === slide.id).map((audio) => <PrintableAudio key={audio.id} audio={audio} />)}
                {audioBlockList.filter((audio) => audio.slide_id === slide.id).map((audio) => <PrintableAudio key={audio.id} audio={audio} />)}
                {slideActivities.length ? (
                  <div className={`${slideBlocks.length ? "mt-6 border-t border-[var(--br-border)] pt-5" : ""} space-y-3`}>
                    <h3 className="text-base font-extrabold text-[var(--br-dark-card)]">Practice</h3>
                    {slideActivities.map((activity, index) => <PrintableActivity key={activity.id} activity={activity} index={index} />)}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!slideList.length ? <p className="py-12 text-center font-semibold text-[var(--br-text-muted)]">This lesson has no printable slides yet.</p> : null}
        </div>

        <footer className="mt-10 border-t border-[var(--br-border)] pt-4 text-center text-xs font-semibold text-[var(--br-text-muted)] print:mt-6">
          BrenUp · Real English. Real connections. · www.brenup.com
        </footer>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
          .print-slide { break-after: page; page-break-after: always; }
          .print-slide:last-child { break-after: auto; page-break-after: auto; }
          .print-blocks > div { gap: 10px !important; }
          .print-blocks section, .print-blocks figure { break-inside: avoid; box-shadow: none !important; }
          .print-blocks img { max-height: 112mm; object-fit: contain; }
          .print-activity { margin-top: 8px; }
        }
      ` }} />
      <script dangerouslySetInnerHTML={{ __html: `document.querySelector('[data-trigger-print="true"]')?.addEventListener('click', () => window.print());` }} />
    </div>
  );
}

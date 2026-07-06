import { Filter, Library, Plus, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { deleteLibraryItem, insertLibraryCopy, saveExistingContentToLibrary } from "./actions";

const itemTypes = ["QUESTION", "ACTIVITY", "LESSON_BLOCK", "SLIDE", "LESSON", "COURSE_TEMPLATE"] as const;

export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const admin = createAdminClient();
  const [
    { data: items },
    { data: reuseEvents },
    { data: questions },
    { data: activities },
    { data: blocks },
    { data: slides },
    { data: lessons },
    { data: quizzes },
    { data: courses },
    { data: profiles },
  ] = await Promise.all([
    admin.from("content_library_items").select("*").order("created_at", { ascending: false }),
    admin.from("content_reuse_events").select("library_item_id"),
    admin.from("quiz_questions").select("id,question_text,question_type,quizzes(title)").order("created_at", { ascending: false }).limit(500),
    admin.from("lesson_slide_activities").select("id,activity_type,slide_number,lessons(title)").order("created_at", { ascending: false }).limit(500),
    admin.from("lesson_blocks").select("id,block_type,position,lessons(title),slides(title)").order("created_at", { ascending: false }).limit(500),
    admin.from("slides").select("id,title,slide_number,lessons(title)").order("created_at", { ascending: false }).limit(500),
    admin.from("lessons").select("id,title,level,topic,status").order("created_at", { ascending: false }),
    admin.from("quizzes").select("id,title,level,topic,status").order("created_at", { ascending: false }),
    admin.from("courses").select("id,title,level,topic,status").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("profiles").select("id,full_name,first_name,last_name"),
  ]);

  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const creatorNames = new Map((profiles ?? []).map((profile) => [
    profile.id,
    profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Creator",
  ]));
  const reuseCounts = new Map<string, number>();
  for (const event of reuseEvents ?? []) reuseCounts.set(event.library_item_id, (reuseCounts.get(event.library_item_id) ?? 0) + 1);

  const filtered = (items ?? []).filter((item) =>
    (!value("type") || item.item_type === value("type"))
    && (!value("level") || item.level === value("level"))
    && (!value("skill") || item.skill === value("skill"))
    && (!value("topic") || item.topic === value("topic"))
    && (!value("activity") || item.activity_type === value("activity"))
    && (!value("course") || item.source_title === value("course"))
    && (!value("creator") || item.created_by === value("creator"))
  );

  const levels = unique((items ?? []).map((item) => item.level));
  const skills = unique((items ?? []).map((item) => item.skill));
  const topics = unique((items ?? []).map((item) => item.topic));
  const activityTypes = unique((items ?? []).map((item) => item.activity_type));
  const sourceTitles = unique((items ?? []).map((item) => item.source_title));
  const creators = unique((items ?? []).map((item) => item.created_by));

  const sources = {
    QUESTION: (questions ?? []).map((row) => ({ id: row.id, label: `${relatedTitle(row.quizzes)} · ${row.question_type} · ${row.question_text}` })),
    ACTIVITY: (activities ?? []).map((row) => ({ id: row.id, label: `${relatedTitle(row.lessons)} · Slide ${row.slide_number} · ${row.activity_type}` })),
    LESSON_BLOCK: (blocks ?? []).map((row) => ({ id: row.id, label: `${relatedTitle(row.lessons)} · ${relatedTitle(row.slides)} · ${row.block_type}` })),
    SLIDE: (slides ?? []).map((row) => ({ id: row.id, label: `${relatedTitle(row.lessons)} · Slide ${row.slide_number}: ${row.title}` })),
    LESSON: (lessons ?? []).map((row) => ({ id: row.id, label: `${row.title} · ${row.level}` })),
    COURSE_TEMPLATE: (courses ?? []).map((row) => ({ id: row.id, label: `${row.title} · ${row.level}` })),
  };

  const slideTargets = (slides ?? []).map((row) => ({ id: row.id, label: `${relatedTitle(row.lessons)} · Slide ${row.slide_number}: ${row.title}` }));

  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Phase 8</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><Library size={25} /> Content Library</h1>
            <p className="mt-2 max-w-3xl text-sm text-black/55">Save questions, activities, blocks, slides, lessons, and course templates. Inserting always creates an independent copy and preserves its origin.</p>
          </div>
          <span className="rounded-full bg-moss/10 px-3 py-1.5 text-sm font-semibold text-moss">{filtered.length} items</span>
        </div>
      </section>

      <details className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Plus size={17} /> Save existing content</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {itemTypes.map((type) => (
            <form key={type} action={saveExistingContentToLibrary} className="grid min-w-0 gap-3 rounded-lg border border-black/10 bg-slate-50 p-3">
              <input type="hidden" name="itemType" value={type} />
              <p className="text-sm font-semibold">{typeLabel(type)}</p>
              <select name="sourceId" required className="min-w-0 rounded-md border border-black/15 bg-white px-3 py-2 text-sm">
                <option value="">Choose existing content</option>
                {sources[type].map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
              <input name="title" placeholder="Library title (optional)" className="min-w-0 rounded-md border border-black/15 px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <input name="level" placeholder="Level" className="min-w-0 rounded-md border border-black/15 px-2 py-2 text-sm" />
                <input name="skill" placeholder="Skill" className="min-w-0 rounded-md border border-black/15 px-2 py-2 text-sm" />
                <input name="topic" placeholder="Topic" className="min-w-0 rounded-md border border-black/15 px-2 py-2 text-sm" />
              </div>
              <button className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Save to library</button>
            </form>
          ))}
        </div>
      </details>

      <form className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Filter size={16} /> Filters</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterSelect name="type" current={value("type")} label="All types" values={[...itemTypes]} format={typeLabel} />
          <FilterSelect name="level" current={value("level")} label="All levels" values={levels} />
          <FilterSelect name="skill" current={value("skill")} label="All skills" values={skills} />
          <FilterSelect name="topic" current={value("topic")} label="All topics" values={topics} />
          <FilterSelect name="activity" current={value("activity")} label="All activities" values={activityTypes} />
          <FilterSelect name="course" current={value("course")} label="All sources/courses" values={sourceTitles} />
          <select name="creator" defaultValue={value("creator")} className="min-w-0 rounded-md border border-black/15 px-3 py-2 text-sm">
            <option value="">All creators</option>
            {creators.map((id) => <option key={id} value={id}>{creatorNames.get(id) ?? "Creator"}</option>)}
          </select>
        </div>
        <button className="mt-3 rounded-md border border-black/15 px-4 py-2 text-sm font-semibold">Apply filters</button>
      </form>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.id} className="min-w-0 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{typeLabel(item.item_type)}</Badge>
                  {item.level ? <Badge>{item.level}</Badge> : null}
                  {item.skill ? <Badge>{item.skill}</Badge> : null}
                  {item.activity_type ? <Badge>{item.activity_type.replaceAll("_", " ")}</Badge> : null}
                </div>
                <h2 className="mt-3 break-words text-lg font-semibold">{item.title}</h2>
                <p className="mt-1 text-xs text-black/45">From {item.source_title || item.source_type} · saved by {item.created_by ? creatorNames.get(item.created_by) ?? "Creator" : "Unknown"} · reused {reuseCounts.get(item.id) ?? 0} times</p>
              </div>
              <form action={deleteLibraryItem.bind(null, item.id)}>
                <button className="rounded-md border border-coral/25 p-2 text-coral hover:bg-coral/5" aria-label="Delete library item"><Trash2 size={15} /></button>
              </form>
            </div>
            <form action={insertLibraryCopy.bind(null, item.id)} className="mt-4 flex min-w-0 gap-2 border-t border-black/10 pt-4">
              {item.item_type === "QUESTION" ? <TargetSelect name="targetId" label="Choose destination quiz" rows={(quizzes ?? []).map((row) => ({ id: row.id, label: row.title }))} /> : null}
              {item.item_type === "ACTIVITY" || item.item_type === "LESSON_BLOCK" ? <TargetSelect name="targetId" label="Choose destination slide" rows={slideTargets} /> : null}
              {item.item_type === "SLIDE" ? <TargetSelect name="targetId" label="Choose destination lesson" rows={(lessons ?? []).map((row) => ({ id: row.id, label: row.title }))} /> : null}
              {item.item_type === "LESSON" || item.item_type === "COURSE_TEMPLATE" ? <input type="hidden" name="targetId" value="" /> : null}
              <button className="shrink-0 rounded-md bg-moss px-3 py-2 text-sm font-semibold text-white">
                {item.item_type === "LESSON" || item.item_type === "COURSE_TEMPLATE" ? "Create copy" : "Insert copy"}
              </button>
            </form>
          </article>
        ))}
        {!filtered.length ? <div className="rounded-xl border border-dashed border-black/15 p-10 text-center text-sm text-black/50 lg:col-span-2">No library items match these filters.</div> : null}
      </section>
    </main>
  );
}

function relatedTitle(value: { title?: string | null } | Array<{ title?: string | null }> | null) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.title || "Untitled";
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function typeLabel(value: string) {
  return value === "COURSE_TEMPLATE" ? "Course template" : value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-black/60">{children}</span>;
}

function FilterSelect({ name, current, label, values, format }: { name: string; current: string; label: string; values: string[]; format?: (value: string) => string }) {
  return (
    <select name={name} defaultValue={current} className="min-w-0 rounded-md border border-black/15 px-3 py-2 text-sm">
      <option value="">{label}</option>
      {values.map((value) => <option key={value} value={value}>{format ? format(value) : value}</option>)}
    </select>
  );
}

function TargetSelect({ name, label, rows }: { name: string; label: string; rows: Array<{ id: string; label: string }> }) {
  return (
    <select name={name} required className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm">
      <option value="">{label}</option>
      {rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
    </select>
  );
}

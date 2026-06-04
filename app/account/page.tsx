import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Heart, LogOut, Sparkles, Trophy } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectLearnedItems(activities: Array<{ activity_type: string; prompt: string; items: Json }>) {
  const vocabulary = new Set<string>();
  const grammar = new Set<string>();
  const functional = new Set<string>();
  const idioms = new Set<string>();

  for (const activity of activities) {
    const items = asRecord(activity.items);
    const prompt = activity.prompt.toLowerCase();
    const type = activity.activity_type.toUpperCase();

    if (Array.isArray(items.left)) {
      for (const item of items.left as Array<{ text?: string }>) {
        if (item.text) vocabulary.add(item.text);
      }
    }

    if (Array.isArray(items.questions)) {
      for (const question of items.questions as string[]) {
        if (typeof question === "string" && question.length < 120) functional.add(question.replace(/^\d+[\).]\s*/, ""));
      }
    }

    if (Array.isArray(items.checklist)) {
      for (const item of items.checklist as string[]) {
        const text = String(item);
        if (/idiom/i.test(text)) idioms.add(text);
        else if (/grammar|tense|reported speech|question|sentence/i.test(text)) grammar.add(text);
        else functional.add(text);
      }
    }

    if (/grammar|gap|sentence|reported speech|tense/.test(prompt) || type === "GAP_FILL") grammar.add(activity.prompt);
    if (/functional|speaking|discussion|real world|polite|conversation/.test(prompt)) functional.add(activity.prompt);
    if (/idiom/.test(prompt)) idioms.add(activity.prompt);
  }

  return {
    vocabulary: [...vocabulary].slice(0, 18),
    idioms: [...idioms].slice(0, 12),
    grammar: [...grammar].slice(0, 12),
    functional: [...functional].slice(0, 12)
  };
}

export default async function AccountPage() {
  const { user, profile } = await requireUser();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const [{ data: progress }, { data: lessons }] = await Promise.all([
    supabase.from("learner_progress").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    adminSupabase.from("lessons").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false })
  ]);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const [{ data: slides }, { data: completedActivities }] = await Promise.all([
    lessonIds.length ? adminSupabase.from("slides").select("lesson_id,type").in("lesson_id", lessonIds) : Promise.resolve({ data: [] }),
    progress?.some((item) => item.completed)
      ? adminSupabase
          .from("slide_activities")
          .select("activity_type,prompt,items,lesson_id")
          .in(
            "lesson_id",
            progress.filter((item) => item.completed).map((item) => item.lesson_id)
          )
      : Promise.resolve({ data: [] })
  ]);

  const lessonMap = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const slideCounts = new Map<string, number>();
  for (const slide of slides ?? []) {
    slideCounts.set(slide.lesson_id, (slideCounts.get(slide.lesson_id) ?? 0) + 1);
  }

  const currentLessons = (progress ?? [])
    .filter((item) => !item.completed && lessonMap.has(item.lesson_id))
    .map((item) => ({ progress: item, lesson: lessonMap.get(item.lesson_id)! }));
  const completedLessons = (progress ?? [])
    .filter((item) => item.completed && lessonMap.has(item.lesson_id))
    .map((item) => ({ progress: item, lesson: lessonMap.get(item.lesson_id)! }));
  const learnedItems = collectLearnedItems(completedActivities ?? []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">My account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
            <p className="mt-2 text-sm text-slate-600">{user.email}</p>
          </div>
          <form action={signOut}>
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
              <LogOut size={16} /> Logout
            </button>
          </form>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard icon={Clock3} label="Current lessons" value={currentLessons.length} />
        <StatCard icon={Trophy} label="Completed lessons" value={completedLessons.length} />
        <StatCard icon={Sparkles} label="Learned items" value={Object.values(learnedItems).reduce((sum, items) => sum + items.length, 0)} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Panel title="Current lessons" icon={Clock3}>
            {currentLessons.length ? (
              <div className="grid gap-3">
                {currentLessons.map(({ lesson, progress: saved }) => {
                  const totalSlides = slideCounts.get(lesson.id) ?? 0;
                  const percent = totalSlides ? Math.round((Math.min(saved.current_slide_number, totalSlides) / totalSlides) * 100) : 0;
                  return (
                    <LessonRow key={lesson.id} title={lesson.title} meta={`${lesson.topic} · ${lesson.level}`} percent={percent} href={`/lessons/${lesson.id}`} action="Continue" />
                  );
                })}
              </div>
            ) : (
              <EmptyState text="No current lessons yet. Start one from the lessons page." href="/dashboard" label="Browse lessons" />
            )}
          </Panel>

          <Panel title="Completed lessons" icon={CheckCircle2}>
            {completedLessons.length ? (
              <div className="grid gap-3">
                {completedLessons.map(({ lesson }) => (
                  <LessonRow key={lesson.id} title={lesson.title} meta={`${lesson.topic} · ${lesson.level}`} percent={100} href={`/lessons/${lesson.id}`} action="Review" />
                ))}
              </div>
            ) : (
              <EmptyState text="Completed lessons will appear here when you finish the final slide." href="/dashboard" label="Start a lesson" />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Learned items" icon={BookOpen}>
            <LearnedGroup title="Vocabulary" items={learnedItems.vocabulary} />
            <LearnedGroup title="Idioms" items={learnedItems.idioms} />
            <LearnedGroup title="Grammar" items={learnedItems.grammar} />
            <LearnedGroup title="Functional language" items={learnedItems.functional} />
            {!Object.values(learnedItems).some((items) => items.length) ? (
              <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Finish a lesson to build your personal learned-items list.</p>
            ) : null}
          </Panel>

          <Panel title="Wish list" icon={Heart}>
            <p className="text-sm leading-6 text-slate-600">
              Save-for-later lessons will appear here. For now, browse published lessons and start the ones you want to study.
            </p>
            <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-medium text-white">
              Browse lessons <ArrowRight size={16} />
            </Link>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="text-moss" size={22} />
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="text-moss" size={20} />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function LessonRow({ title, meta, percent, href, action }: { title: string; meta: string; percent: number; href: string; action: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{meta}</p>
        </div>
        <Link href={href} className="shrink-0 rounded-md bg-ink px-3 py-2 text-xs font-medium text-white">
          {action}
        </Link>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-moss" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{percent}% complete</p>
    </div>
  );
}

function LearnedGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <div className="mb-5 last:mb-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{text}</p>
      <Link href={href} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-moss">
        {label} <ArrowRight size={15} />
      </Link>
    </div>
  );
}

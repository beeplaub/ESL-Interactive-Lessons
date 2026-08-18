import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles, Target, TrendingUp } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeSkillEvidence, summarizeTargetEvidence } from "@/lib/obeReports";

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function bandClass(band: string) {
  if (band === "Strong") return "bg-emerald-50 text-emerald-700";
  if (band === "Secure") return "bg-blue-50 text-blue-700";
  if (band === "Developing") return "bg-amber-50 text-amber-700";
  return "bg-surface-strong text-slate-600";
}

export default async function LanguageProfilePage({ searchParams }: { searchParams?: Promise<{ course?: string }> }) {
  const { user, profile } = await requireUser();
  const cookieStore = await cookies();
  const isAdminLearnerView = profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner";
  if (profile?.role === "ADMIN" && !isAdminLearnerView) redirect("/admin");

  const admin = createAdminClient();
  const query = searchParams ? await searchParams : {};
  const { data: attempts } = await admin.from("assessment_attempts").select("id,user_id,course_item_id,source_type,quiz_id,lesson_activity_id,attempt_number,completed_at").eq("user_id", user.id).order("completed_at", { ascending: false });
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const { data: responses } = attemptIds.length
    ? await admin.from("assessment_responses").select("id,attempt_id,assessment_item_id,earned_points,maximum_points,is_correct,response_data,submitted_at").in("attempt_id", attemptIds).order("submitted_at", { ascending: false })
    : { data: [] };
  const assessmentItemIds = Array.from(new Set((responses ?? []).map((response) => response.assessment_item_id)));
  const { data: evidenceItems } = assessmentItemIds.length
    ? await admin.from("assessment_items").select("id,prompt_snapshot,lesson_outcome_id,quiz_question_id,lesson_activity_id").in("id", assessmentItemIds)
    : { data: [] };
  const [{ data: skills }, { data: targets }, { data: itemSkills }, { data: itemTargets }, { data: courseResults }] = await Promise.all([
    admin.from("learning_skills").select("id,name,parent_id").eq("status", "ACTIVE").order("position"),
    admin.from("learning_targets").select("id,label,target_type").eq("status", "ACTIVE").order("label"),
    assessmentItemIds.length ? admin.from("assessment_item_skills").select("assessment_item_id,skill_id,is_primary").in("assessment_item_id", assessmentItemIds) : Promise.resolve({ data: [] }),
    assessmentItemIds.length ? admin.from("assessment_item_targets").select("assessment_item_id,learning_target_id").in("assessment_item_id", assessmentItemIds) : Promise.resolve({ data: [] }),
    admin.from("course_assessment_results").select("id,course_id,score_percent,coverage_percent,completion_percent,status,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
  ]);

  const resultIds = (courseResults ?? []).map((result) => result.id);
  const courseIds = Array.from(new Set((courseResults ?? []).map((result) => result.course_id)));
  const [{ data: courses }, { data: outcomeRows }] = await Promise.all([
    courseIds.length ? admin.from("courses").select("id,title").in("id", courseIds) : Promise.resolve({ data: [] }),
    resultIds.length ? admin.from("course_outcome_assessment_results").select("course_assessment_result_id,course_outcome_id,attainment_percent,coverage_percent,attained").in("course_assessment_result_id", resultIds) : Promise.resolve({ data: [] }),
  ]);
  const outcomeIds = Array.from(new Set((outcomeRows ?? []).map((row) => row.course_outcome_id)));
  const { data: outcomes } = outcomeIds.length ? await admin.from("course_outcomes").select("id,code,outcome").in("id", outcomeIds) : { data: [] };
  const lessonOutcomeIds = Array.from(new Set((evidenceItems ?? []).map((item) => item.lesson_outcome_id).filter((id): id is string => Boolean(id))));
  const { data: lessonOutcomes } = lessonOutcomeIds.length ? await admin.from("lesson_outcomes").select("id,code,outcome").in("id", lessonOutcomeIds) : { data: [] };
  const { data: evidenceMappings } = assessmentItemIds.length
    ? await admin.from("assessment_item_course_outcomes").select("assessment_item_id,course_item_id,course_outcome_id").in("assessment_item_id", assessmentItemIds)
    : { data: [] };

  const skillRows = summarizeSkillEvidence({ skills: skills ?? [], responses: responses ?? [], itemSkills: itemSkills ?? [] }).sort((a, b) => b.confidence - a.confidence);
  const targetRows = summarizeTargetEvidence({ targets: targets ?? [], responses: responses ?? [], itemTargets: itemTargets ?? [] }).sort((a, b) => b.confidence - a.confidence);
  const totalEarned = (responses ?? []).reduce((sum, response) => sum + Number(response.earned_points || 0), 0);
  const totalPossible = (responses ?? []).reduce((sum, response) => sum + Number(response.maximum_points || 0), 0);
  const overall = totalPossible ? (totalEarned / totalPossible) * 100 : 0;
  const courseById = new Map((courses ?? []).map((course) => [course.id, course]));
  const resultById = new Map((courseResults ?? []).map((result) => [result.id, result]));
  const outcomeById = new Map((outcomes ?? []).map((outcome) => [outcome.id, outcome]));
  const lessonOutcomeById = new Map((lessonOutcomes ?? []).map((outcome) => [outcome.id, outcome]));
  const evidenceItemById = new Map((evidenceItems ?? []).map((item) => [item.id, item]));
  const courseOutcomeMappingByKey = new Map((evidenceMappings ?? []).map((mapping) => [`${mapping.assessment_item_id}:${mapping.course_item_id}`, mapping.course_outcome_id]));
  const courseItemIds = Array.from(new Set((attempts ?? []).map((attempt) => attempt.course_item_id).filter((id): id is string => Boolean(id))));
  const { data: evidenceCourseItems } = courseItemIds.length ? await admin.from("course_items").select("id,title,course_id,lessons(title),quizzes(title)").in("id", courseItemIds) : { data: [] };
  const evidenceCourseItemById = new Map((evidenceCourseItems ?? []).map((item) => [item.id, item]));
  const quizQuestionIds = Array.from(new Set((evidenceItems ?? []).map((item) => item.quiz_question_id).filter((id): id is string => Boolean(id))));
  const activityIds = Array.from(new Set((evidenceItems ?? []).map((item) => item.lesson_activity_id).filter((id): id is string => Boolean(id))));
  const [{ data: evidenceQuestions }, { data: evidenceActivities }] = await Promise.all([
    quizQuestionIds.length ? admin.from("quiz_questions").select("id,quiz_id,question_number").in("id", quizQuestionIds) : Promise.resolve({ data: [] }),
    activityIds.length ? admin.from("lesson_slide_activities").select("id,lesson_id,slide_number").in("id", activityIds) : Promise.resolve({ data: [] }),
  ]);
  const questionById = new Map((evidenceQuestions ?? []).map((question) => [question.id, question]));
  const activityById = new Map((evidenceActivities ?? []).map((activity) => [activity.id, activity]));
  const attemptById = new Map((attempts ?? []).map((attempt) => [attempt.id, attempt]));
  const evidenceRows = (responses ?? []).slice(0, 30).map((response) => {
    const attempt = attemptById.get(response.attempt_id);
    const item = evidenceItemById.get(response.assessment_item_id);
    const courseItem = attempt?.course_item_id ? evidenceCourseItemById.get(attempt.course_item_id) : null;
    const question = item?.quiz_question_id ? questionById.get(item.quiz_question_id) : null;
    const activity = item?.lesson_activity_id ? activityById.get(item.lesson_activity_id) : null;
    const mappedOutcomeId = item && attempt?.course_item_id ? courseOutcomeMappingByKey.get(`${item.id}:${attempt.course_item_id}`) : null;
    return {
      id: response.id,
      source: courseItem?.title || courseItem?.lessons?.[0]?.title || courseItem?.quizzes?.[0]?.title || (attempt?.source_type === "QUIZ" ? "Standalone quiz" : "Lesson activity"),
      courseId: courseItem?.course_id ?? null,
      prompt: item?.prompt_snapshot || "Assessment question",
      earned: Number(response.earned_points ?? 0),
      maximum: Number(response.maximum_points ?? 0),
      correct: response.is_correct,
      submittedAt: response.submitted_at,
      href: question ? `/quizzes/${question.quiz_id}` : activity ? `/lessons/${activity.lesson_id}?slide=${activity.slide_number}` : null,
      outcome: mappedOutcomeId ? outcomeById.get(mappedOutcomeId)?.outcome ?? null : item?.lesson_outcome_id ? lessonOutcomeById.get(item.lesson_outcome_id)?.outcome ?? null : null,
    };
  });
  const allCanDos = (outcomeRows ?? []).map((row) => ({ ...row, outcome: outcomeById.get(row.course_outcome_id), courseId: resultById.get(row.course_assessment_result_id)?.course_id })).filter((row) => row.outcome);
  const selectedCourseId = query.course && courseIds.includes(query.course) ? query.course : courseIds[0] ?? null;
  const selectedResult = (courseResults ?? []).find((result) => result.course_id === selectedCourseId) ?? null;
  const selectedCanDos = allCanDos.filter((row) => row.courseId === selectedCourseId);
  const achievedCount = allCanDos.filter((row) => row.attained).length;
  const canDoAverage = allCanDos.length ? allCanDos.reduce((sum, row) => sum + Number(row.attainment_percent ?? 0), 0) / allCanDos.length : 0;
  const ringStyle = { background: `conic-gradient(var(--br-chart-primary) ${Math.min(100, Math.max(0, canDoAverage))}%, var(--br-surface-strong) 0)` };

  return (
    <LearnerAppShell active="language-profile" showRightSidebar>
      <LearnerPageHero eyebrow="Language profile" eyebrowIcon={Sparkles} title="Your English evidence map" description="See your overall Can-Do growth, then open a course to explore the evidence behind it." aside={<div className="grid w-full min-w-0 grid-cols-3 gap-2 text-center sm:min-w-[340px]"><Stat label="Evidence" value={String(responses?.length ?? 0)} /><Stat label="Can-Dos" value={`${achievedCount}/${allCanDos.length}`} /><Stat label="Current" value={totalPossible ? pct(overall) : "—"} /></div>} />

      <section className="br-learner-card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative grid size-28 shrink-0 place-items-center rounded-full p-2 sm:size-36" style={ringStyle}>
              <div className="grid size-full place-items-center rounded-full bg-surface text-center">
                <div><p className="text-2xl font-black text-[var(--br-dark-card)] sm:text-3xl">{Math.round(canDoAverage)}%</p><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">overall attainment</p></div>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-chart-primary)]">Your Can-Do map</p>
              <h2 className="mt-1 break-words text-xl font-black text-[var(--br-dark-card)] sm:text-2xl">{achievedCount ? `${achievedCount} abilities are showing evidence` : "Your abilities will grow here"}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">{allCanDos.length ? "This overview stays compact. Choose a course below when you want the detailed outcome breakdown." : "Complete mapped course activities to build a measurable record of what you can do in English."}</p>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 rounded-2xl bg-[var(--br-canvas-elevated)] p-4 lg:min-w-[270px]">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--br-text-muted)]"><span>Attained</span><span>{achievedCount}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><span className="block h-full rounded-full bg-[var(--br-success)]" style={{ width: `${allCanDos.length ? (achievedCount / allCanDos.length) * 100 : 0}%` }} /></div>
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--br-text-muted)]"><span>Courses with evidence</span><span>{courseIds.length}</span></div>
          </div>
        </div>
        {allCanDos.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{allCanDos.slice(0, 6).map((row, index) => <MiniCanDo key={`${row.course_assessment_result_id}-${row.course_outcome_id}-${index}`} label={row.outcome?.outcome ?? "Course outcome"} value={Number(row.attainment_percent ?? 0)} attained={Boolean(row.attained)} />)}</div> : null}
      </section>

      {courseResults?.length ? (
        <section className="br-learner-card min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 flex-col gap-3 border-b border-[var(--br-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-chart-primary)]">Detailed view</p><h2 className="mt-1 text-xl font-black text-[var(--br-dark-card)]">Course Can-Dos</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Select one course to explore its mapped outcomes.</p></div>
            <form method="get" action="/language-profile" className="flex min-w-0 items-center gap-2"><label htmlFor="profile-course" className="sr-only">Choose course</label><select id="profile-course" name="course" defaultValue={selectedCourseId ?? ""} className="min-w-0 max-w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-[var(--br-dark-card)]"><option value="">Choose a course</option>{courseIds.map((courseId) => <option key={courseId} value={courseId}>{courseById.get(courseId)?.title ?? "Course"}</option>)}</select><button className="rounded-xl bg-[var(--br-chart-primary)] px-3 py-2 text-xs font-black text-on-dark">View</button></form>
          </div>
          {selectedResult ? <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start"><div className="min-w-0"><h3 className="break-words text-lg font-black text-[var(--br-dark-card)]">{courseById.get(selectedResult.course_id)?.title ?? "Course"}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{selectedCanDos.length ? selectedCanDos.map((row, index) => <CanDoCard key={`${row.course_outcome_id}-${index}`} code={row.outcome?.code ?? "Outcome"} label={row.outcome?.outcome ?? "Course outcome"} attainment={Number(row.attainment_percent ?? 0)} coverage={Number(row.coverage_percent ?? 0)} attained={Boolean(row.attained)} />) : <EmptyLine text="No mapped outcomes have evidence yet." />}</div></div><div className="grid gap-3 rounded-2xl bg-[var(--br-canvas-elevated)] p-4"><StatDark label="Score" value={pct(Number(selectedResult.score_percent ?? 0))} /><StatDark label="Coverage" value={pct(Number(selectedResult.coverage_percent ?? 0))} /><StatDark label="Status" value={String(selectedResult.status).replaceAll("_", " ")} /></div></div> : <EmptyLine text="Choose a course to see its Can-Do evidence." />}
        </section>
      ) : null}

      {responses?.length ? <div className="grid min-w-0 gap-5 xl:grid-cols-2"><EvidenceSection title="Skill mastery" icon={<TrendingUp className="size-5 text-[var(--br-chart-primary)]" />} description="Confidence uses your most recent evidence first." rows={skillRows.map((row) => ({ key: row.skill.id, label: row.skill.name, detail: `${row.evidenceCount} evidence record${row.evidenceCount === 1 ? "" : "s"}`, band: row.band, value: row.confidence }))} empty="No skill-labeled evidence yet. New quizzes and lessons will start filling this in." /><EvidenceSection title="Learned targets" icon={<Sparkles className="size-5 text-[var(--br-achievement)]" />} description="Vocabulary, grammar, idioms, and pronunciation targets." rows={targetRows.slice(0, 12).map((row) => ({ key: row.target.id, label: row.target.label, detail: row.target.target_type.replaceAll("_", " "), band: row.band, value: row.confidence }))} empty="No learning targets have been mastered yet." /></div> : <section className="br-learner-card p-8 text-center"><CheckCircle2 className="mx-auto size-10 text-[var(--br-chart-primary)]" /><h2 className="mt-3 text-xl font-black text-[var(--br-dark-card)]">Your profile is ready to grow</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--br-text-muted)]">Once you complete scored quizzes or course activities, this page will show your strengths, learned items, confidence, and Can-Do evidence.</p><Link href="/quizzes" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-brand)] px-5 py-3 text-sm font-black text-on-dark">Start with a quiz <ArrowRight className="size-4" /></Link></section>}
      {evidenceRows.length ? <section className="br-learner-card min-w-0 p-4 sm:p-5"><div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-chart-primary)]">Traceable evidence</p><h2 className="mt-1 text-xl font-black text-[var(--br-dark-card)]">Recent answers behind your progress</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Every result keeps its source, score, and date so your profile remains explainable.</p></div><div className="grid gap-2">{evidenceRows.map((row) => <div key={row.id} className="min-w-0 rounded-2xl border border-[var(--br-surface-strong)] p-3"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-[var(--br-chart-primary)]">{row.href ? <Link href={row.href} className="hover:underline">{row.source} <ArrowRight className="inline size-3" /></Link> : row.source}</p><p className="mt-1 break-words text-sm font-bold text-[var(--br-dark-card)]">{row.prompt}</p>{row.outcome ? <p className="mt-1 break-words text-xs text-[var(--br-text-muted)]">Can-Do: {row.outcome}</p> : null}</div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${row.correct === true ? "bg-emerald-50 text-emerald-700" : row.correct === false ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{row.earned}/{row.maximum}</span></div><p className="mt-2 text-[11px] font-semibold text-[var(--br-text-muted)]">{new Date(row.submittedAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}</p></div>)}</div></section> : null}
    </LearnerAppShell>
  );
}

function EvidenceSection({ title, icon, description, rows, empty }: { title: string; icon: React.ReactNode; description: string; rows: Array<{ key: string; label: string; detail: string; band: string; value: number }>; empty: string }) {
  return <section className="br-learner-card min-w-0 p-4 sm:p-5"><div className="mb-4 flex items-center gap-2">{icon}<div><h2 className="text-lg font-black text-[var(--br-dark-card)]">{title}</h2><p className="text-xs text-[var(--br-text-muted)]">{description}</p></div></div><div className="grid gap-3">{rows.length ? rows.map((row) => <div key={row.key} className="min-w-0 rounded-2xl border border-[var(--br-surface-strong)] p-3"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-bold text-[var(--br-dark-card)]">{row.label}</h3><p className="text-xs text-[var(--br-text-muted)]">{row.detail}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${bandClass(row.band)}`}>{row.band}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--br-chart-primary)] to-[var(--br-info)]" style={{ width: `${Math.min(100, Math.round(row.value))}%` }} /></div><p className="mt-1.5 text-[11px] font-semibold text-[var(--br-text-muted)]">Confidence {pct(row.value)}</p></div>) : <EmptyLine text={empty} />}</div></section>;
}

function CanDoCard({ code, label, attainment, coverage, attained }: { code: string; label: string; attainment: number; coverage: number; attained: boolean }) {
  return <div className="min-w-0 rounded-2xl border border-[var(--br-surface-strong)] p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-[var(--br-chart-primary)]">{code}</p><h4 className="mt-1 break-words text-sm font-bold text-[var(--br-dark-card)]">{label}</h4></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${attained ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{attained ? "Attained" : "Building"}</span></div><div className="mt-3 grid gap-2"><ProfileBar label="Attainment" value={attainment} /><ProfileBar label="Coverage" value={coverage} /></div></div>;
}

function MiniCanDo({ label, value, attained }: { label: string; value: number; attained: boolean }) {
  return <div className="min-w-0 rounded-2xl bg-[var(--br-canvas-elevated)] p-3"><div className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${attained ? "bg-[var(--br-success)]" : "bg-[var(--br-achievement)]"}`} /><p className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--br-dark-card)]">{label}</p><span className="text-xs font-black text-[var(--br-text-muted)]">{Math.round(value)}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><span className="block h-full rounded-full bg-[var(--br-chart-primary)]" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>;
}

function ProfileBar({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div><div className="mb-1 flex justify-between text-xs font-semibold text-[var(--br-text-muted)]"><span>{label}</span><span>{Math.round(safe)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--br-surface-strong)]"><span className="block h-full rounded-full bg-[var(--br-chart-primary)]" style={{ width: `${safe}%` }} /></div></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-2 py-3 backdrop-blur sm:px-3"><div className="truncate text-xl font-black sm:text-2xl">{value}</div><div className="text-[10px] font-bold uppercase tracking-wide text-white/60">{label}</div></div>; }
function StatDark({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-black uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p><p className="mt-1 break-words text-lg font-black text-[var(--br-dark-card)]">{value}</p></div>; }
function EmptyLine({ text }: { text: string }) { return <p className="rounded-2xl bg-[var(--br-canvas-elevated)] px-4 py-5 text-sm font-medium text-[var(--br-text-muted)]">{text}</p>; }

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCourseOutcomeRows } from "@/lib/obeReports";

function pct(value: number) {
  return `${Math.round(value)}%`;
}

export default async function CourseOutcomeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCourseAccess(id);
  const admin = createAdminClient();
  const [{ data: course }, { data: outcomes }, { data: items }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin.from("course_outcomes").select("*").eq("course_id", id).order("position"),
    admin.from("course_items").select("id,item_type,title,lesson_id,quiz_id,assessment_weight").eq("course_id", id),
  ]);
  if (!course) notFound();

  const itemIds = (items ?? []).map((item) => item.id);
  const { data: directMappings } = itemIds.length
    ? await admin
        .from("assessment_item_course_outcomes")
        .select("assessment_item_id,course_item_id,course_outcome_id,contribution_weight")
        .in("course_item_id", itemIds)
    : { data: [] };
  const { data: attempts } = itemIds.length
    ? await admin
        .from("assessment_attempts")
        .select("id,user_id,course_item_id,completed_at")
        .in("course_item_id", itemIds)
    : { data: [] };
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const { data: responses } = attemptIds.length
    ? await admin
        .from("assessment_responses")
        .select("id,attempt_id,assessment_item_id,earned_points,maximum_points,is_correct,submitted_at")
        .in("attempt_id", attemptIds)
    : { data: [] };
  const responseAssessmentIds = Array.from(new Set((responses ?? []).map((response) => response.assessment_item_id)));
  const { data: responseAssessmentItems } = responseAssessmentIds.length
    ? await admin
        .from("assessment_items")
        .select("id,lesson_outcome_id")
        .in("id", responseAssessmentIds)
    : { data: [] };
  const { data: lessonOutcomeMappings } = itemIds.length
    ? await admin
        .from("course_lesson_outcome_mappings")
        .select("course_item_id,lesson_outcome_id,course_outcome_id,contribution_weight")
        .in("course_item_id", itemIds)
    : { data: [] };
  const lessonOutcomeByAssessmentItem = new Map((responseAssessmentItems ?? []).map((item) => [item.id, item.lesson_outcome_id]));
  const derivedLessonMappings = (responses ?? []).flatMap((response) => {
    const attempt = (attempts ?? []).find((candidate) => candidate.id === response.attempt_id);
    if (!attempt?.course_item_id) return [];
    const lessonOutcomeId = lessonOutcomeByAssessmentItem.get(response.assessment_item_id);
    if (!lessonOutcomeId) return [];
    return (lessonOutcomeMappings ?? [])
      .filter((mapping) => mapping.course_item_id === attempt.course_item_id && mapping.lesson_outcome_id === lessonOutcomeId)
      .map((mapping) => ({
        assessment_item_id: response.assessment_item_id,
        course_item_id: mapping.course_item_id,
        course_outcome_id: mapping.course_outcome_id,
        contribution_weight: mapping.contribution_weight,
      }));
  });
  const mappings = [
    ...(directMappings ?? []),
    ...derivedLessonMappings,
  ];

  const rows = calculateCourseOutcomeRows({
    outcomes: outcomes ?? [],
    mappings,
    responses: responses ?? [],
    attempts: attempts ?? [],
    defaultThreshold: course.mastery_threshold ?? 70,
    defaultCoverage: course.minimum_evidence_coverage ?? 70,
  });

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
        <Link href={`/admin/courses/${course.id}/builder`} className="inline-flex items-center gap-2 text-sm text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]">
          <ArrowLeft size={16} /> Back to course builder
        </Link>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-moss">Course outcomes report</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{course.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">
              Attainment shows learner performance on attempted evidence. Coverage shows how much mapped evidence has actually been attempted.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Outcomes" value={String(rows.length)} />
            <Metric label="Evidence" value={String(responses?.length ?? 0)} />
            <Metric label="Policy" value={course.evidence_selection ?? "LATEST"} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-[var(--br-text-muted)]">
              <tr>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Mapped weight</th>
                <th className="px-4 py-3">Evidence</th>
                <th className="px-4 py-3">Attainment</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((row) => (
                <tr key={row.outcome.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-ink">{row.outcome.code ?? "CO"} · {row.outcome.outcome}</p>
                    <p className="mt-1 text-xs text-[var(--br-text-muted)]">Mastery {row.masteryThreshold}% · required coverage {row.minimumCoverage}%</p>
                  </td>
                  <td className="px-4 py-4 font-semibold">{row.mappedWeight}</td>
                  <td className="px-4 py-4">{row.evidenceCount}</td>
                  <td className="px-4 py-4">
                    <Progress value={row.attainmentPercent} color="bg-moss" label={pct(row.attainmentPercent)} />
                  </td>
                  <td className="px-4 py-4">
                    <Progress value={row.coveragePercent} color="bg-[var(--br-chart-primary)]" label={pct(row.coveragePercent)} />
                  </td>
                  <td className="px-4 py-4">
                    {row.attained ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={14} /> Attained
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        <ShieldAlert size={14} /> Needs evidence
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--br-text-muted)]">
                    No course outcomes yet. Add outcomes in the course builder first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted px-4 py-3">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p>
    </div>
  );
}

function Progress({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="min-w-[130px]">
      <div className="mb-1 text-xs font-semibold text-[var(--br-text-muted)]">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

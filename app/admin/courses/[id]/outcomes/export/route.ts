import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCourseAccess(id, "view_analytics");
  const admin = createAdminClient();
  const [{ data: course }, { data: outcomes }, { data: results }, { data: courseItems }] = await Promise.all([
    admin.from("courses").select("id,title,evidence_selection").eq("id", id).maybeSingle(),
    admin.from("course_outcomes").select("id,code,outcome").eq("course_id", id).order("position"),
    admin.from("course_assessment_results").select("id,user_id,score_percent,coverage_percent,completion_percent,status,updated_at").eq("course_id", id).order("updated_at", { ascending: false }),
    admin.from("course_items").select("id,assessment_type").eq("course_id", id),
  ]);
  if (!course) return new Response("Course not found", { status: 404 });

  const resultIds = (results ?? []).map((result) => result.id);
  const [{ data: outcomeResults }, { data: profiles }, { data: itemResults }] = await Promise.all([
    resultIds.length
      ? admin.from("course_outcome_assessment_results").select("course_assessment_result_id,course_outcome_id,attainment_percent,coverage_percent,attained").in("course_assessment_result_id", resultIds)
      : Promise.resolve({ data: [] }),
    resultIds.length
      ? admin.from("profiles").select("id,full_name,first_name,last_name").in("id", Array.from(new Set((results ?? []).map((result) => result.user_id))))
      : Promise.resolve({ data: [] }),
    resultIds.length
      ? admin.from("course_item_assessment_results").select("course_assessment_result_id,course_item_id,score_percent,completed").in("course_assessment_result_id", resultIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const valueByKey = new Map((outcomeResults ?? []).map((row) => [`${row.course_assessment_result_id}:${row.course_outcome_id}`, row]));
  const itemTypeById = new Map((courseItems ?? []).map((item) => [item.id, item.assessment_type ?? "FORMATIVE"]));
  const header = ["Course", "Learner", "Score %", "Coverage %", "Completion %", "Formative avg %", "Summative avg %", "Status", "Updated", ...(outcomes ?? []).map((outcome) => `${outcome.code ?? "Outcome"}: ${outcome.outcome}`)];
  const lines = [header.map(csvCell).join(",")];
  for (const result of results ?? []) {
    const profile = profileById.get(result.user_id);
    const learner = profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner";
    const learnerItems = (itemResults ?? []).filter((item) => item.course_assessment_result_id === result.id && item.completed);
    const categoryAverage = (category: "FORMATIVE" | "SUMMATIVE") => {
      const values = learnerItems.filter((item) => itemTypeById.get(item.course_item_id) === category).map((item) => Number(item.score_percent ?? 0));
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : "";
    };
    const row = [course.title, learner, Math.round(Number(result.score_percent ?? 0)), Math.round(Number(result.coverage_percent ?? 0)), Math.round(Number(result.completion_percent ?? 0)), categoryAverage("FORMATIVE"), categoryAverage("SUMMATIVE"), String(result.status ?? "").replaceAll("_", " "), result.updated_at];
    for (const outcome of outcomes ?? []) {
      const value = valueByKey.get(`${result.id}:${outcome.id}`);
      row.push(value ? `${Math.round(Number(value.attainment_percent ?? 0))}%${value.attained ? " attained" : ""}` : "");
    }
    lines.push(row.map(csvCell).join(","));
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="course-outcomes-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

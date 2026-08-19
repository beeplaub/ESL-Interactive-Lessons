import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Args = Record<string, unknown>;

function authorized(request: Request) {
  const configured = process.env.BRENUP_AI_GATEWAY_SECRET;
  return Boolean(configured && request.headers.get("authorization") === `Bearer ${configured}`);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 180) : fallback;
}

function cap(value: unknown, max = 6000): unknown {
  if (typeof value === "string") return value.slice(0, max);
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => cap(item, max));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).map(([key, item]) => [key, cap(item, max)]));
  }
  return value;
}

async function findCourse(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const id = text(args.courseId);
  if (id) {
    const { data } = await admin.from("courses").select("id,title,status,level,topic,category,description,updated_at").eq("id", id).maybeSingle();
    return data;
  }
  const query = text(args.query || args.courseQuery);
  if (!query) return null;
  const { data } = await admin.from("courses").select("id,title,status,level,topic,category,description,updated_at").or(`title.ilike.%${query}%,topic.ilike.%${query}%,slug.ilike.%${query}%`).order("updated_at", { ascending: false }).limit(5);
  return data?.[0] ?? null;
}

async function searchCourses(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const query = text(args.query);
  let request = admin.from("courses").select("id,title,status,level,topic,category,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(30);
  if (query) request = request.or(`title.ilike.%${query}%,topic.ilike.%${query}%,slug.ilike.%${query}%`);
  const { data, error } = await request;
  if (error) throw error;
  return { query, courses: data ?? [] };
}

async function courseOverview(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const course = await findCourse(admin, args);
  if (!course) return { found: false, message: "No matching course was found in the database." };
  const [{ data: sections }, { data: items }, { data: outcomes }] = await Promise.all([
    admin.from("course_sections").select("id,position,title,description").eq("course_id", course.id).order("position"),
    admin.from("course_items").select("id,section_id,position,item_type,title,description,lesson_id,quiz_id,status,assessment_type,item_assessment_weight,normalization_target,is_required").eq("course_id", course.id).order("position"),
    admin.from("course_outcomes").select("id,code,position,outcome,weight,mastery_threshold_override,status").eq("course_id", course.id).order("position"),
  ]);
  const lessonIds = (items ?? []).map((item) => item.lesson_id).filter(Boolean);
  const quizIds = (items ?? []).map((item) => item.quiz_id).filter(Boolean);
  const [{ data: lessons }, { data: quizzes }] = await Promise.all([
    lessonIds.length ? admin.from("lessons").select("id,title,topic,level,status").in("id", lessonIds) : Promise.resolve({ data: [] }),
    quizIds.length ? admin.from("quizzes").select("id,title,topic,level,status").in("id", quizIds) : Promise.resolve({ data: [] }),
  ]);
  return { found: true, course, sections: sections ?? [], items: items ?? [], lessons: lessons ?? [], quizzes: quizzes ?? [], outcomes: outcomes ?? [] };
}

async function lessonAudit(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const course = await findCourse(admin, args);
  const lessonQuery = text(args.lessonQuery || args.lessonTitle || args.query);
  let lessonId = text(args.lessonId);
  let placement = null;
  if (!lessonId && course) {
    const { data: items } = await admin.from("course_items").select("id,section_id,position,title,lesson_id").eq("course_id", course.id).not("lesson_id", "is", null).order("position");
    placement = (items ?? []).find((item) => lessonQuery && `${item.position} ${item.title ?? ""}`.toLowerCase().includes(lessonQuery.toLowerCase())) ?? (items ?? []).find((item) => String(item.position) === lessonQuery);
    lessonId = placement?.lesson_id ?? "";
  }
  if (!lessonId && lessonQuery) {
    const { data } = await admin.from("lessons").select("id,title,topic,level,status").ilike("title", `%${lessonQuery}%`).limit(5);
    lessonId = data?.[0]?.id ?? "";
  }
  if (!lessonId) return { found: false, message: "No matching lesson was found. Use search_courses first if the course title is uncertain." };
  const [{ data: lesson }, { data: slides }, { data: blocks }, { data: activities }, { data: outcomes }] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status,description,timer_minutes,updated_at").eq("id", lessonId).maybeSingle(),
    admin.from("slides").select("id,slide_number,title,section_label,raw_text,type").eq("lesson_id", lessonId).order("slide_number"),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position"),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data,needs_review,raw_text").eq("lesson_id", lessonId).order("slide_number"),
    admin.from("lesson_outcomes").select("id,code,outcome,position,status").eq("lesson_id", lessonId).order("position"),
  ]);
  if (!lesson) return { found: false, message: "The selected lesson no longer exists." };
  const activitySummary = (activities ?? []).map((activity) => {
    const data = activity.activity_data && typeof activity.activity_data === "object" ? activity.activity_data as Record<string, unknown> : {};
    const candidate = ["questions", "items", "pairs", "sentences", "options"].find((key) => Array.isArray(data[key]));
    return { id: activity.id, slideNumber: activity.slide_number, type: activity.activity_type, needsReview: activity.needs_review, questionCount: candidate ? (data[candidate] as unknown[]).length : null, hasData: Object.keys(data).length > 0 };
  });
  return { found: true, course: course ? { id: course.id, title: course.title } : null, placement, lesson, outcomes: outcomes ?? [], slides: slides ?? [], blocks: (blocks ?? []).map((block) => ({ ...block, content: cap(block.content) })), activities: (activities ?? []).map((activity) => ({ ...activity, activity_data: cap(activity.activity_data) })), activitySummary };
}

async function quizOverview(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const id = text(args.quizId);
  const query = text(args.query || args.title);
  let quiz;
  if (id) quiz = (await admin.from("quizzes").select("id,title,topic,level,status,created_at").eq("id", id).maybeSingle()).data;
  else quiz = (await admin.from("quizzes").select("id,title,topic,level,status,created_at").ilike("title", `%${query}%`).limit(1).maybeSingle()).data;
  if (!quiz) return { found: false, message: "No matching quiz was found in the database." };
  const { data: questions } = await admin.from("quiz_questions").select("id,question_number,question_type,question_text,options,correct_answer").eq("quiz_id", quiz.id).order("question_number");
  return { found: true, quiz, questions: (questions ?? []).map((question) => cap(question)) };
}

async function obeAudit(admin: ReturnType<typeof createAdminClient>, args: Args) {
  const course = await findCourse(admin, args);
  if (!course) return { found: false, message: "No matching course was found in the database." };
  const [{ data: items }, { data: outcomes }] = await Promise.all([
    admin.from("course_items").select("id,position,title,item_type,lesson_id,quiz_id,assessment_type,item_assessment_weight,normalization_target,is_required").eq("course_id", course.id).order("position"),
    admin.from("course_outcomes").select("id,code,position,outcome,weight,mastery_threshold_override,status").eq("course_id", course.id).order("position"),
  ]);
  const itemIds = (items ?? []).map((item) => item.id);
  const [{ data: lessonMappings }, { data: directMappings }] = await Promise.all([
    itemIds.length ? admin.from("course_lesson_outcome_mappings").select("course_item_id,lesson_outcome_id,course_outcome_id,contribution_weight").in("course_item_id", itemIds) : Promise.resolve({ data: [] }),
    itemIds.length ? admin.from("assessment_item_course_outcomes").select("assessment_item_id,course_item_id,course_outcome_id,contribution_weight").in("course_item_id", itemIds) : Promise.resolve({ data: [] }),
  ]);
  return { found: true, course: { id: course.id, title: course.title, status: course.status }, outcomes: outcomes ?? [], items: items ?? [], lessonOutcomeMappings: lessonMappings ?? [], questionOutcomeMappings: directMappings ?? [], coverage: { courseItems: items?.length ?? 0, courseOutcomes: outcomes?.length ?? 0, mappedCourseItemRows: lessonMappings?.length ?? 0, mappedQuestionRows: directMappings?.length ?? 0 } };
}

async function obeAuditAll(admin: ReturnType<typeof createAdminClient>) {
  const [{ data: courses }, { data: items }, { data: outcomes }] = await Promise.all([
    admin.from("courses").select("id,title,status,level,topic").is("deleted_at", null).order("title").limit(100),
    admin.from("course_items").select("id,course_id,item_type,title,lesson_id,quiz_id,assessment_type,item_assessment_weight,normalization_target").order("course_id").order("position"),
    admin.from("course_outcomes").select("id,course_id,code,outcome,status").order("course_id").order("position"),
  ]);
  const itemIds = (items ?? []).map((item) => item.id);
  const [{ data: lessonMappings }, { data: questionMappings }] = await Promise.all([
    itemIds.length ? admin.from("course_lesson_outcome_mappings").select("course_item_id,course_outcome_id,lesson_outcome_id,contribution_weight").in("course_item_id", itemIds) : Promise.resolve({ data: [] }),
    itemIds.length ? admin.from("assessment_item_course_outcomes").select("course_item_id,course_outcome_id,assessment_item_id,contribution_weight").in("course_item_id", itemIds) : Promise.resolve({ data: [] }),
  ]);
  const summaries = (courses ?? []).map((course) => {
    const courseItems = (items ?? []).filter((item) => item.course_id === course.id);
    const courseOutcomes = (outcomes ?? []).filter((outcome) => outcome.course_id === course.id);
    const courseLessonMappings = (lessonMappings ?? []).filter((mapping) => courseItems.some((item) => item.id === mapping.course_item_id));
    const courseQuestionMappings = (questionMappings ?? []).filter((mapping) => courseItems.some((item) => item.id === mapping.course_item_id));
    const mappedOutcomeIds = new Set([...courseLessonMappings.map((mapping) => mapping.course_outcome_id), ...courseQuestionMappings.map((mapping) => mapping.course_outcome_id)]);
    return {
      course,
      outcomeCount: courseOutcomes.length,
      itemCount: courseItems.length,
      lessonCount: courseItems.filter((item) => item.item_type === "LESSON").length,
      quizCount: courseItems.filter((item) => item.item_type === "QUIZ").length,
      mappedOutcomeCount: mappedOutcomeIds.size,
      unmappedOutcomes: courseOutcomes.filter((outcome) => !mappedOutcomeIds.has(outcome.id)).map((outcome) => ({ code: outcome.code, outcome: outcome.outcome })),
      lessonMappingRows: courseLessonMappings.length,
      questionMappingRows: courseQuestionMappings.length,
      hasIncompleteMapping: courseOutcomes.some((outcome) => !mappedOutcomeIds.has(outcome.id)) || courseItems.length === 0,
    };
  });
  return { readOnly: true, scope: "all active courses", courses: summaries, totals: { courses: summaries.length, incompleteCourses: summaries.filter((summary) => summary.hasIncompleteMapping).length } };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { tool?: unknown; args?: Args } | null;
  const tool = text(body?.tool);
  const args = body?.args ?? {};
  try {
    const admin = createAdminClient();
    const result = tool === "search_courses" ? await searchCourses(admin, args)
      : tool === "get_course_overview" ? await courseOverview(admin, args)
      : tool === "audit_lesson" ? await lessonAudit(admin, args)
      : tool === "get_quiz_overview" ? await quizOverview(admin, args)
      : tool === "get_obe_audit" ? await obeAudit(admin, args)
      : tool === "audit_obe_all_courses" ? await obeAuditAll(admin)
      : null;
    if (result === null) return NextResponse.json({ error: "Tool is not available." }, { status: 400 });
    return NextResponse.json({ readOnly: true, source: "BrenUp database", result: cap(result, 10000) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Safe data query failed." }, { status: 500 });
  }
}

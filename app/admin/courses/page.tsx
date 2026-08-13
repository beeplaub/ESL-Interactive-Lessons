import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";
import { AdminCoursesWorkspace, type AdminCourseSummary } from "@/components/AdminCoursesWorkspace";

type CourseRow = {
  id: string;
  title: string;
  subtitle: string | null;
  topic: string | null;
  category: string | null;
  level: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  thumbnail_path: string | null;
  cover_image_path: string | null;
  description: string | null;
  price_bdt: number | null;
  payment_instructions: string | null;
  organization_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  updated_at: string;
};

type CourseRelationRow = { course_id: string | null };
type CourseItemRow = CourseRelationRow & { item_type: string };

export default async function AdminCoursesPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const isAdmin = isPlatformAdmin(profile?.role);
  const scopedToOwn = !isAdmin;
  const schoolOrganizationIds = profile?.role === "SCHOOL_ADMIN" ? await getSchoolAdminOrganizationIds(user.id) : [];

  let coursesQuery = admin
    .from("courses")
    .select("id,title,subtitle,topic,category,level,status,thumbnail_path,cover_image_path,description,price_bdt,payment_instructions,organization_id,owner_id,created_by,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  let trashedQuery = admin.from("courses").select("id", { count: "exact", head: true }).not("deleted_at", "is", null);

  if (profile?.role === "SCHOOL_ADMIN") {
    coursesQuery = schoolOrganizationIds.length
      ? coursesQuery.in("organization_id", schoolOrganizationIds)
      : coursesQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    trashedQuery = schoolOrganizationIds.length
      ? trashedQuery.in("organization_id", schoolOrganizationIds)
      : trashedQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (scopedToOwn) {
    coursesQuery = coursesQuery.or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
    trashedQuery = trashedQuery.or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
  }

  const [{ data: courseRows, error: coursesError }, { count: trashedCount }] = await Promise.all([
    coursesQuery,
    trashedQuery,
  ]);
  if (coursesError) throw new Error(coursesError.message);

  const courses = (courseRows ?? []) as CourseRow[];
  const courseIds = courses.map((course) => course.id);
  const organizationIds = Array.from(new Set(courses.map((course) => course.organization_id).filter((id): id is string => Boolean(id))));
  const creatorIds = Array.from(new Set(courses.flatMap((course) => [course.owner_id, course.created_by]).filter((id): id is string => Boolean(id))));

  const emptyRows = Promise.resolve({ data: [], error: null });
  const [enrollmentResult, itemResult, sectionResult, outcomeResult, organizationResult, creatorResult, creationOrganizationResult] = await Promise.all([
    courseIds.length ? admin.from("course_enrollments").select("course_id,status").in("course_id", courseIds) : emptyRows,
    courseIds.length ? admin.from("course_items").select("course_id,item_type").in("course_id", courseIds) : emptyRows,
    courseIds.length ? admin.from("course_sections").select("course_id").in("course_id", courseIds) : emptyRows,
    courseIds.length ? admin.from("course_outcomes").select("course_id").in("course_id", courseIds) : emptyRows,
    organizationIds.length ? admin.from("organizations").select("id,name").in("id", organizationIds) : emptyRows,
    creatorIds.length ? admin.from("profiles").select("id,full_name,first_name,last_name").in("id", creatorIds) : emptyRows,
    isAdmin
      ? admin.from("organizations").select("id,name").order("name")
      : profile?.role === "SCHOOL_ADMIN" && schoolOrganizationIds.length
        ? admin.from("organizations").select("id,name").in("id", schoolOrganizationIds).order("name")
        : emptyRows,
  ]);

  const enrollments = (enrollmentResult.data ?? []) as Array<CourseRelationRow & { status: string }>;
  const items = (itemResult.data ?? []) as CourseItemRow[];
  const sections = (sectionResult.data ?? []) as CourseRelationRow[];
  const outcomes = (outcomeResult.data ?? []) as CourseRelationRow[];
  const organizations = (organizationResult.data ?? []) as Array<{ id: string; name: string }>;
  const creators = (creatorResult.data ?? []) as Array<{ id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null }>;

  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const creatorNames = new Map(creators.map((creator) => [creator.id, displayName(creator)]));
  const enrollmentCounts = countByCourse(enrollments.filter((row) => row.status !== "CANCELLED"));
  const itemCounts = countByCourse(items);
  const lessonCounts = countByCourse(items.filter((row) => row.item_type === "LESSON"));
  const quizCounts = countByCourse(items.filter((row) => row.item_type === "QUIZ"));
  const sectionCounts = countByCourse(sections);
  const outcomeCounts = countByCourse(outcomes);

  const summaries: AdminCourseSummary[] = courses.map((course) => {
    const itemCount = itemCounts.get(course.id) ?? 0;
    const sectionCount = sectionCounts.get(course.id) ?? 0;
    const outcomeCount = outcomeCounts.get(course.id) ?? 0;
    const checks = [
      { label: "Add the course description and target level", ready: Boolean(course.description?.trim() && course.level) },
      { label: "Add a cover or card image", ready: Boolean(course.thumbnail_path || course.cover_image_path) },
      { label: "Add curriculum items", ready: itemCount > 0 },
      { label: "Organize the curriculum into sections", ready: sectionCount > 0 },
      { label: "Define at least one course outcome", ready: outcomeCount > 0 },
      { label: "Add payment instructions for this paid course", ready: !course.price_bdt || Boolean(course.payment_instructions?.trim()) },
    ];
    const readinessScore = Math.round((checks.filter((check) => check.ready).length / checks.length) * 100);

    return {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      topic: course.topic,
      category: course.category,
      level: course.level,
      status: course.status,
      thumbnailPath: course.thumbnail_path,
      coverImagePath: course.cover_image_path,
      organizationId: course.organization_id,
      organizationName: course.organization_id ? organizationNames.get(course.organization_id) ?? "School course" : null,
      creatorId: course.owner_id ?? course.created_by,
      creatorName: creatorNames.get(course.owner_id ?? course.created_by ?? "") ?? "BrenUp creator",
      itemCount,
      lessonCount: lessonCounts.get(course.id) ?? 0,
      quizCount: quizCounts.get(course.id) ?? 0,
      enrollmentCount: enrollmentCounts.get(course.id) ?? 0,
      sectionCount,
      outcomeCount,
      readinessScore,
      readinessIssues: checks.filter((check) => !check.ready).map((check) => check.label),
      updatedAt: course.updated_at,
    };
  });

  return (
    <AdminCoursesWorkspace
      initialCourses={summaries}
      trashedCount={trashedCount ?? 0}
      organizations={(creationOrganizationResult.data ?? []) as Array<{ id: string; name: string }>}
      organizationRequired={profile?.role === "SCHOOL_ADMIN"}
      showOwnershipFilters={isAdmin || profile?.role === "SCHOOL_ADMIN"}
    />
  );
}

function countByCourse(rows: CourseRelationRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.course_id) continue;
    map.set(row.course_id, (map.get(row.course_id) ?? 0) + 1);
  }
  return map;
}

function displayName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "BrenUp creator";
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolAdminOrganizationIds } from "@/lib/schoolAccess";

export type NotificationAudienceType = "ALL_USERS" | "ROLE" | "ORGANIZATION" | "CLASS" | "COURSE" | "USERS";

type Audience = { type: NotificationAudienceType; value?: string | null; userIds?: string[] };
type Actor = { id: string; role?: string | null };

export async function resolveNotificationAudience(actor: Actor, audience: Audience) {
  const admin = createAdminClient();
  if (actor.role === "ADMIN") {
    if (audience.type === "ALL_USERS") {
      const { data } = await admin.from("profiles").select("id");
      return (data ?? []).map((row) => row.id);
    }
    if (audience.type === "ROLE") {
      const { data } = await admin.from("profiles").select("id").eq("role", audience.value || "LEARNER");
      return (data ?? []).map((row) => row.id);
    }
    if (audience.type === "ORGANIZATION") return organizationUserIds(audience.value || "");
    if (audience.type === "CLASS") return classUserIds(audience.value || "");
    if (audience.type === "COURSE") return courseUserIds(audience.value || "");
    return [...new Set((audience.userIds ?? []).filter(Boolean))];
  }

  const managedClasses = await manageableClassIds(actor);
  if (audience.type === "CLASS") {
    if (!managedClasses.includes(audience.value || "")) throw new Error("You can only notify learners in your own class.");
    return classUserIds(audience.value || "");
  }
  if (audience.type === "ORGANIZATION" && actor.role === "SCHOOL_ADMIN") {
    const organizations = await getSchoolAdminOrganizationIds(actor.id);
    if (!organizations.includes(audience.value || "")) throw new Error("You can only notify members of your own school.");
    return organizationUserIds(audience.value || "");
  }
  if (audience.type === "USERS") {
    const allowed = new Set((await Promise.all(managedClasses.map(classUserIds))).flat());
    const selected = [...new Set((audience.userIds ?? []).filter((id) => allowed.has(id)))];
    if (!selected.length && (audience.userIds ?? []).length) throw new Error("Choose learners from a class you manage.");
    return selected;
  }
  throw new Error("Choose a class, school, or specific learners you manage.");
}

export async function getNotificationAudienceOptions(actor: Actor) {
  const admin = createAdminClient();
  const classes = await manageableClasses(actor);
  const classIds = classes.map((row) => row.id);
  const { data: classMembers } = classIds.length
    ? await admin.from("class_members").select("class_id,user_id").in("class_id", classIds).eq("role", "STUDENT")
    : { data: [] as Array<{ class_id: string; user_id: string }> };
  const learnerIds = [...new Set((classMembers ?? []).map((row) => row.user_id))];
  const { data: learnerProfiles } = learnerIds.length
    ? await admin.from("profiles").select("id,first_name,last_name,full_name").in("id", learnerIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; full_name: string | null }> };
  const organizations = actor.role === "ADMIN"
    ? (await admin.from("organizations").select("id,name").order("name")).data ?? []
    : actor.role === "SCHOOL_ADMIN"
      ? (await admin.from("organizations").select("id,name").in("id", await getSchoolAdminOrganizationIds(actor.id)).order("name")).data ?? []
      : [];
  const courses = actor.role === "ADMIN"
    ? (await admin.from("courses").select("id,title").is("deleted_at", null).order("title")).data ?? []
    : [];
  return {
    classes,
    organizations,
    courses,
    learners: (learnerProfiles ?? []).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Learner" })),
  };
}

async function manageableClasses(actor: Actor) {
  const admin = createAdminClient();
  let query = admin.from("classes").select("id,name,organization_id").eq("status", "ACTIVE").order("name");
  if (actor.role === "SCHOOL_ADMIN") {
    const ids = await getSchoolAdminOrganizationIds(actor.id);
    if (!ids.length) return [] as Array<{ id: string; name: string; organization_id: string | null }>;
    query = query.in("organization_id", ids);
  } else if (actor.role !== "ADMIN") {
    query = query.or(`teacher_id.eq.${actor.id},created_by.eq.${actor.id}`);
  }
  const { data } = await query;
  return data ?? [];
}

async function manageableClassIds(actor: Actor) {
  return (await manageableClasses(actor)).map((row) => row.id);
}

async function classUserIds(classId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role", "STUDENT");
  return (data ?? []).map((row) => row.user_id);
}

async function courseUserIds(courseId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("course_enrollments").select("user_id").eq("course_id", courseId).in("status", ["ACTIVE", "COMPLETED"]);
  return (data ?? []).map((row) => row.user_id);
}

async function organizationUserIds(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: members }, { data: classes }] = await Promise.all([
    admin.from("organization_members").select("user_id").eq("organization_id", organizationId),
    admin.from("classes").select("id").eq("organization_id", organizationId),
  ]);
  const classIds = (classes ?? []).map((row) => row.id);
  const { data: classMembers } = classIds.length ? await admin.from("class_members").select("user_id").in("class_id", classIds) : { data: [] };
  return [...new Set([...(members ?? []).map((row) => row.user_id), ...(classMembers ?? []).map((row) => row.user_id)])];
}

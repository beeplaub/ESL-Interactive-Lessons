import { NextResponse } from "next/server";
import { createSignedCourseResourceUrl } from "@/lib/storage/mediaStorage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getFreshProfile, isStaff } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string; resourceId: string }> }) {
  const { courseId, resourceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download course resources." }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: course }, { data: resource }, { data: enrollment }, profile] = await Promise.all([
    admin.from("courses").select("id,owner_id,created_by,organization_id").eq("id", courseId).maybeSingle(),
    (admin as any).from("course_resources").select("id,title,file_name,bucket,path,resource_type,external_url").eq("course_id", courseId).eq("id", resourceId).maybeSingle(),
    admin.from("course_enrollments").select("status").eq("course_id", courseId).eq("user_id", user.id).maybeSingle(),
    getFreshProfile(user.id),
  ]);
  if (!course || !resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });

  const enrollmentAllowed = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";
  let managerAllowed = Boolean(isStaff(profile?.role) && (profile?.role === "ADMIN" || course.owner_id === user.id || course.created_by === user.id));
  if (!managerAllowed && profile?.role === "SCHOOL_ADMIN" && course.organization_id) {
    const { data: membership } = await admin.from("organization_members").select("id").eq("organization_id", course.organization_id).eq("user_id", user.id).in("role", ["OWNER", "SCHOOL_ADMIN"]).maybeSingle();
    managerAllowed = Boolean(membership);
  }
  if (!managerAllowed && isStaff(profile?.role)) {
    const { data: staff } = await admin.from("course_staff").select("manage_curriculum").eq("course_id", courseId).eq("user_id", user.id).maybeSingle();
    managerAllowed = Boolean(staff?.manage_curriculum);
  }
  if (!enrollmentAllowed && !managerAllowed) return NextResponse.json({ error: "Enroll in this course to download its resources." }, { status: 403 });

  try {
    if (resource.resource_type !== "UPLOAD") {
      const destination = new URL(resource.external_url);
      if (destination.protocol !== "https:") return NextResponse.json({ error: "This resource link is invalid." }, { status: 400 });
      return NextResponse.redirect(destination.toString(), { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }
    const url = await createSignedCourseResourceUrl({ bucket: resource.bucket, path: resource.path, fileName: resource.file_name }, 60);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not prepare this download. Please try again." }, { status: 500 });
  }
}

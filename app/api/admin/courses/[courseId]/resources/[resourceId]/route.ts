import { NextResponse } from "next/server";
import { requireCourseAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ courseId: string; resourceId: string }> }) {
  const { courseId, resourceId } = await params;
  await requireCourseAccess(courseId, "manage_curriculum");
  try {
    const admin = createAdminClient();
    const { data: resource, error: readError } = await (admin as any).from("course_resources").select("id,bucket,path").eq("course_id", courseId).eq("id", resourceId).maybeSingle();
    if (readError) return NextResponse.json({ error: "Could not load this resource." }, { status: 500 });
    if (!resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    await deleteMediaObject(admin, { provider: "r2", bucket: resource.bucket, path: resource.path });
    const { error } = await (admin as any).from("course_resources").delete().eq("course_id", courseId).eq("id", resourceId);
    if (error) return NextResponse.json({ error: "The file was removed from storage, but its listing could not be deleted." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete this resource." }, { status: 500 });
  }
}

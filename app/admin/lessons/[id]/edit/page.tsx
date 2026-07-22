import { redirect } from "next/navigation";
import { requireLessonAccess } from "@/lib/auth";

/**
 * This page predates the slide-based lesson builder (it worked against the
 * older slides/slide_activities model) and nothing in the app links to it
 * anymore — /admin/lessons only ever links to /builder now. Rather than
 * leave a second, unmaintained editing surface live and reachable by direct
 * URL, it now just forwards to the current builder for the same lesson.
 */
export default async function LegacyEditLessonRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireLessonAccess(id);
  redirect(`/admin/lessons/${id}/builder`);
}

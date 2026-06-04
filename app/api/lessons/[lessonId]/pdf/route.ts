import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const { data: lesson } = await admin.from("lessons").select("pdf_path,status").eq("id", lessonId).single();

  if (!lesson?.pdf_path) {
    return NextResponse.json({ error: "Lesson PDF not found" }, { status: 404 });
  }

  if (lesson.status !== "PUBLISHED" && profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data: pdf, error } = await admin.storage.from("lessons").download(lesson.pdf_path);
  if (error || !pdf) {
    return NextResponse.json({ error: "Could not load lesson PDF" }, { status: 500 });
  }

  return new Response(await pdf.arrayBuffer(), {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "private, max-age=300"
    }
  });
}

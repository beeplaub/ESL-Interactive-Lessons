import { LessonPrintDocument } from "@/app/lessons/[lessonId]/print/page";

export const dynamic = "force-dynamic";

export default async function AdminLessonPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonPrintDocument lessonId={id} />;
}

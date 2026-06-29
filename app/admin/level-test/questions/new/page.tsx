import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function NewLevelTestQuestionPage() {
  await requireAdmin();
  redirect("/admin/level-test");
}

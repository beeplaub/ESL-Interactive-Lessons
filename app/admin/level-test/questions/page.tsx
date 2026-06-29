import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLevelTestQuestionsPage() {
  await requireAdmin();
  redirect("/admin/level-test");
}

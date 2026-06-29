import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLevelTestPassagesPage() {
  await requireAdmin();
  redirect("/admin/level-test");
}

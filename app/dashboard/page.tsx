import { redirect } from "next/navigation";
import { requireUser, roleHomePath } from "@/lib/auth";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  redirect(roleHomePath(profile?.role));
}

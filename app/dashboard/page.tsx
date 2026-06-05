import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, roleHomePath } from "@/lib/auth";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const cookieStore = await cookies();
  if (profile?.role === "ADMIN" && cookieStore.get("view_mode")?.value === "learner") {
    redirect("/account");
  }
  if (profile?.role !== "ADMIN") {
    redirect("/account");
  }
  redirect(roleHomePath(profile?.role));
}

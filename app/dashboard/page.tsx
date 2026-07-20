import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, roleHomePath, isStaff } from "@/lib/auth";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const cookieStore = await cookies();
  if (isStaff(profile?.role) && cookieStore.get("view_mode")?.value === "learner") {
    redirect("/account");
  }
  if (!isStaff(profile?.role)) {
    redirect("/account");
  }
  redirect(roleHomePath(profile?.role));
}

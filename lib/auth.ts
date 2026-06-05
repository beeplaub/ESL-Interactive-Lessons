import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getFreshProfile(userId: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return profile;
}

export function roleHomePath(role?: string | null) {
  return role === "ADMIN" ? "/admin" : "/account";
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getFreshProfile(user.id);

  return { user, profile };
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile?.role !== "ADMIN") {
    redirect("/account");
  }
  return session;
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { user, profile };
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile?.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return session;
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");
  redirect("/login");
}

export async function switchToLearnerView() {
  const cookieStore = await cookies();
  cookieStore.set("view_mode", "learner", {
    path: "/",
    sameSite: "lax"
  });
  redirect("/dashboard");
}

export async function switchToAdminView() {
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");
  redirect("/admin");
}

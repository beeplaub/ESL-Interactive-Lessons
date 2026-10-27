"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  const userAgent = (await headers()).get("user-agent") ?? "";
  if (userAgent.includes("BrenUpAndroid")) {
    try {
      const { data } = await supabase.auth.getClaims();
      const userId = data?.claims?.sub;
      if (userId) {
        await supabase.from("push_devices").update({
          enabled: false,
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("platform", "ANDROID");
      }
    } catch {
      // Signing out takes precedence if notification cleanup is unavailable.
    }
  }
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
  redirect("/account");
}

export async function switchToAdminView() {
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");
  redirect("/admin");
}

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff, roleHomePath } from "@/lib/auth";

function safeNextPath(nextPath: string | null) {
  return nextPath?.startsWith("/")
    && !nextPath.startsWith("//")
    && !nextPath.startsWith("/admin")
    && !nextPath.includes("\\")
    ? nextPath
    : null;
}

/** Finish the existing profile/invitation work after an OAuth session is verified. */
export async function completeOAuthSignIn(user: User, nextPath: string | null) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const needsNames = !existing?.first_name;
  let firstName = "";
  let lastName = "";
  let fullName = existing?.full_name ?? "";

  if (needsNames) {
    const meta = user.user_metadata ?? {};
    firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";

    if (!firstName) {
      const rawFull = typeof meta.full_name === "string"
        ? meta.full_name.trim()
        : typeof meta.name === "string"
          ? meta.name.trim()
          : "";
      if (rawFull) {
        const parts = rawFull.split(/\s+/).filter(Boolean);
        firstName = parts[0] ?? "";
        lastName = parts.slice(1).join(" ");
      }
    }

    fullName = [firstName, lastName].filter(Boolean).join(" ") || user.email || "Learner";
  }

  if (!existing) {
    await admin.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      role: "LEARNER",
    });
  } else if (needsNames) {
    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        first_name: firstName || null,
        last_name: lastName || null,
      })
      .eq("id", user.id);
  }

  const { data: invitation } = await admin
    .from("teacher_invitations")
    .select("id")
    .eq("user_id", user.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  let role = existing?.role ?? "LEARNER";
  if (invitation) {
    await admin.from("teacher_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
    await admin.from("profiles").update({ role: "TEACHER" }).eq("id", user.id);
    role = "TEACHER";
  }

  const safeNext = safeNextPath(nextPath);
  return isStaff(role) ? "/admin" : safeNext ?? roleHomePath(role);
}

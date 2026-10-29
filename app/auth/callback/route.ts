import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff, roleHomePath } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nativeComplete = requestUrl.searchParams.get("native_complete") === "1";
  const isAndroidShell = request.headers.get("user-agent")?.includes("BrenUpAndroid") ?? false;
  const nextPath = requestUrl.searchParams.get("next");
  let redirectPath = "/account";

  if (requestUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL("/login?auth=oauth_failed", request.url));
  }

  // The Android shell sends the callback back through its WebView so the
  // browser client can exchange the PKCE code using the verifier stored by
  // the WebView that started sign-in. The server then performs the existing
  // profile and invitation finalization in native_complete mode.
  if (code && isAndroidShell && !nativeComplete) {
    const callbackUrl = new URL("/auth/native-callback", requestUrl.origin);
    callbackUrl.searchParams.set("code", code);
    if (nextPath) callbackUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(callbackUrl);
  }

  if (!nativeComplete && !code) {
    return NextResponse.redirect(new URL("/login?auth=missing_code", request.url));
  }

  const supabase = await createClient();
  if (code && !nativeComplete) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?auth=exchange_failed", request.url));
    }
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?auth=session_missing", request.url));
  }

  const admin = createAdminClient();

  // ── 1. Fetch whatever the trigger already created ────────────────────
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // ── 2. Resolve names from auth metadata ──────────────────────────────
  // Only resolve and write if the profile is missing first_name —
  // this prevents overwriting a name the user changed on the profile page.
  const needsNames = !existing?.first_name;

  let firstName = "";
  let lastName  = "";
  let fullName  = existing?.full_name ?? "";

  if (needsNames) {
    const meta = user.user_metadata ?? {};

    // Email/password signup: first_name + last_name sent explicitly
    firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    lastName  = typeof meta.last_name  === "string" ? meta.last_name.trim()  : "";

    if (!firstName) {
      // Google OAuth / other providers: split full_name or name
      const rawFull =
        typeof meta.full_name === "string"
          ? meta.full_name.trim()
          : typeof meta.name === "string"
            ? meta.name.trim()
            : "";
      if (rawFull) {
        const parts = rawFull.split(/\s+/).filter(Boolean);
        firstName = parts[0] ?? "";
        lastName  = parts.slice(1).join(" ");
      }
    }

    fullName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Learner";
  }

  // ── 3. Insert or patch ───────────────────────────────────────────────
  if (!existing) {
    // Brand new user — trigger didn't fire yet or was skipped
    await admin.from("profiles").insert({
      id:         user.id,
      full_name:  fullName,
      first_name: firstName || null,
      last_name:  lastName  || null,
      role:       "LEARNER",
    });
  } else if (needsNames) {
    // Trigger created the row but left first_name/last_name empty —
    // patch just those columns, leave role and everything else alone
    await admin
      .from("profiles")
      .update({
        full_name:  fullName,
        first_name: firstName || null,
        last_name:  lastName  || null,
      })
      .eq("id", user.id);
  }
  // else: profile already has a name — don't touch it

  // ── 4. Accept a pending teacher invitation, if this sign-in came from
  // one. The invitation row is created only by a platform admin using the
  // service role, so learner-controlled metadata can never self-promote an
  // account to staff.
  const { data: invitation } = await admin
    .from("teacher_invitations")
    .select("id")
    .eq("user_id", user.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  let role = existing?.role ?? "LEARNER";
  if (invitation) {
    await admin.from("teacher_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
    await admin.from("profiles").update({ role: "TEACHER" }).eq("id", user.id);
    role = "TEACHER";
  }

  // ── 5. Redirect based on role ────────────────────────────────────────
  const safeNextPath = nextPath?.startsWith("/")
    && !nextPath.startsWith("//")
    && !nextPath.startsWith("/admin")
    && !nextPath.includes("\\")
    ? nextPath
    : null;
  redirectPath = isStaff(role)
    ? "/admin"
    : safeNextPath
      ? safeNextPath
      : roleHomePath(role);
  // A stale "view as learner" cookie from a previous session must never
  // carry over into a fresh sign-in.
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

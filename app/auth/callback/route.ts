import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleHomePath } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next");
  let redirectPath = "/account";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user) {
        const admin = createAdminClient();
        const meta = user.user_metadata ?? {};

        // ── Resolve names from metadata ──────────────────────────────────────
        // Email/password signup sends first_name + last_name explicitly.
        // Google OAuth and other providers send full_name or name only.
        let firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
        let lastName  = typeof meta.last_name  === "string" ? meta.last_name.trim()  : "";

        if (!firstName) {
          // Provider fallback: split whatever full name string is available
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

        const fullName =
          [firstName, lastName].filter(Boolean).join(" ") ||
          user.email ||
          "Learner";

        // ── Upsert profile ───────────────────────────────────────────────────
        // We always upsert (not just insert) because the DB trigger fires the
        // moment the auth.users row is created and already inserts a profile row
        // with only full_name. If we only inserted on !profile the name fields
        // would be left null for email/password signups. Upserting here ensures
        // first_name and last_name are always written from the real metadata,
        // whether the trigger ran first or not.
        const { data: profile } = await admin
          .from("profiles")
          .upsert(
            {
              id:         user.id,
              full_name:  fullName,
              first_name: firstName || null,
              last_name:  lastName  || null,
            },
            {
              onConflict:        "id",
              // Only fill name columns when they are currently empty —
              // this prevents overwriting a name the user intentionally
              // changed later on the profile page.
              ignoreDuplicates: false,
            }
          )
          .select("role, first_name, last_name")
          .maybeSingle();

        // Fetch full profile for role-based redirect (upsert returns updated row)
        const { data: freshProfile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        redirectPath =
          freshProfile?.role === "ADMIN"
            ? "/admin"
            : nextPath?.startsWith("/") && !nextPath.startsWith("/admin")
              ? nextPath
              : roleHomePath(freshProfile?.role);
      }
    }
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

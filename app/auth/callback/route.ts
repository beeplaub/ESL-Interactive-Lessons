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
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        let profile = existingProfile;
        if (!profile) {
          const meta = user.user_metadata ?? {};

          // Email/password signup sends first_name + last_name directly.
          // Google OAuth sends full_name (or name). Handle both cleanly.
          let firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
          let lastName = typeof meta.last_name === "string" ? meta.last_name.trim() : "";

          if (!firstName) {
            // Google OAuth fallback: split full_name
            const rawFull =
              typeof meta.full_name === "string"
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

          const fullName =
            [firstName, lastName].filter(Boolean).join(" ") ||
            user.email ||
            "Learner";

          const { data: insertedProfile } = await admin
            .from("profiles")
            .insert({
              id: user.id,
              full_name: fullName,
              first_name: firstName || null,
              last_name: lastName || null,
              role: "LEARNER"
            })
            .select("*")
            .single();
          profile = insertedProfile;
        }

        redirectPath =
          profile?.role === "ADMIN"
            ? "/admin"
            : nextPath?.startsWith("/") && !nextPath.startsWith("/admin")
              ? nextPath
              : roleHomePath(profile?.role);
      }
    }
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

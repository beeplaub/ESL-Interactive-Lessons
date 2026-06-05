import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleHomePath } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next");
  let redirectPath = "/lessons";

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
          const fullName =
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : typeof user.user_metadata?.name === "string"
                ? user.user_metadata.name
                : "";
          const [firstName = "", ...rest] = fullName.trim().split(/\s+/).filter(Boolean);
          const lastName = rest.join(" ");

          const { data: insertedProfile } = await admin
            .from("profiles")
            .insert({
              id: user.id,
              full_name: fullName || user.email || "Learner",
              first_name: firstName,
              last_name: lastName,
              role: "LEARNER"
            })
            .select("*")
            .single();
          profile = insertedProfile;
        }

        redirectPath = profile?.role === "ADMIN" ? "/admin" : nextPath?.startsWith("/") && !nextPath.startsWith("/admin") ? nextPath : roleHomePath(profile?.role);
      }
    }
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

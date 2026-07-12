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
  // getClaims() verifies the JWT locally (cached JWKS + WebCrypto) when the
  // project uses asymmetric signing keys, instead of the network round-trip
  // to the Auth server that getUser() always makes. Every page that calls
  // requireUser()/requireAdmin() was paying that cost a second time on top
  // of middleware's own auth check — this closes that gap the same way.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims) {
    redirect("/login");
  }

  const user = { id: claims.sub, email: claims.email };
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

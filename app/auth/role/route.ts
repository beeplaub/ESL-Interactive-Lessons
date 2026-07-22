import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getFreshProfile, resolvePostLoginPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ redirectTo: "/login" });
  }

  const profile = await getFreshProfile(user.id);
  const nextPath = request.nextUrl.searchParams.get("next");

  // A stale "view as learner" cookie from a previous session must never
  // carry over into a fresh sign-in — every login starts staff back in
  // creator mode, no exceptions.
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");

  return NextResponse.json({ redirectTo: resolvePostLoginPath(profile?.role, nextPath) });
}

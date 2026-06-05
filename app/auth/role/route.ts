import { NextResponse, type NextRequest } from "next/server";
import { getFreshProfile, roleHomePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function safeNext(nextPath: string | null, role?: string | null) {
  if (role === "ADMIN") return "/admin";
  if (nextPath?.startsWith("/") && !nextPath.startsWith("/admin")) return nextPath;
  return roleHomePath(role);
}

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
  return NextResponse.json({ redirectTo: safeNext(nextPath, profile?.role) });
}

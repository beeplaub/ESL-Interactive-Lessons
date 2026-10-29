import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { completeOAuthSignIn } from "@/lib/auth/completeOAuthSignIn";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return json({ error: "invalid_origin" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (!body || typeof body !== "object") return json({ error: "invalid_request" }, 400);
  const payload = body as Record<string, unknown>;
  const accessToken = payload.accessToken;
  const refreshToken = payload.refreshToken;
  const nextPath = payload.nextPath;
  if (
    typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192
    || typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 8192
    || (nextPath !== undefined && typeof nextPath !== "string")
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError || !sessionData.session) {
    return json({ error: "session_rejected" }, 401);
  }

  // Validate the received access token with Auth rather than relying on a
  // cookie being visible during this same request.
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: "session_rejected" }, 401);

  const redirectTo = await completeOAuthSignIn(userData.user, typeof nextPath === "string" ? nextPath : null);
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");
  return json({ redirectTo });
}

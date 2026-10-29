import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { completeOAuthSignIn } from "@/lib/auth/completeOAuthSignIn";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nativeComplete = requestUrl.searchParams.get("native_complete") === "1";
  const isAndroidShell = request.headers.get("user-agent")?.includes("BrenUpAndroid") ?? false;
  const nextPath = requestUrl.searchParams.get("next");

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

  const redirectPath = await completeOAuthSignIn(user, nextPath);
  // A stale "view as learner" cookie from a previous session must never
  // carry over into a fresh sign-in.
  const cookieStore = await cookies();
  cookieStore.delete("view_mode");

  return NextResponse.redirect(new URL(redirectPath, request.url));
}

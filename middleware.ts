import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the JWT's signature itself (via a cached JWKS +
  // WebCrypto) when the Supabase project uses asymmetric signing keys,
  // instead of making a live network round-trip to the Auth server on every
  // single navigation the way getUser() always does. If the project is still
  // on the legacy symmetric secret, this transparently falls back to the same
  // live call getUser() made — so this is a safe swap either way (same
  // security guarantee, never slower), and a real win once asymmetric keys
  // are turned on in Supabase Dashboard -> Authentication -> JWT Keys.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isProtectedPath =
    pathname.startsWith("/account") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin");

  // 1. Unauthenticated user → send to login.
  if (!claims && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2. Read role from JWT claims (no extra DB round-trip needed).
  //    Supabase sets app_metadata.role when you update profiles.role via service role.
  //    Falls back to user_metadata.role if present.
  //    NOTE: The authoritative admin check is done in requireAdmin() in the layout.
  const viewMode = request.cookies.get("view_mode")?.value;
  const jwtRole =
    (claims?.app_metadata?.role as string | undefined) ??
    (claims?.user_metadata?.role as string | undefined);

  // 3. Admins landing on /dashboard or /account (when not in learner-view) → send to /admin.
  if (
    claims &&
    jwtRole === "ADMIN" &&
    viewMode !== "learner" &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/account"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 4. Authenticated user on /login → send them home.
  //    We intentionally do NOT block /admin here — requireAdmin() in the layout handles that
  //    reliably. Doing it in middleware with a DB call is what caused the /lessons redirect bug.
  if (claims && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const nextPath = request.nextUrl.searchParams.get("next");
    const isAdminUser = jwtRole === "ADMIN";
    url.pathname = isAdminUser
      ? "/admin"
      : nextPath?.startsWith("/") && !nextPath.startsWith("/admin")
        ? nextPath
        : "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

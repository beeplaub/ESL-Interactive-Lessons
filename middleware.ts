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

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtectedPath =
    pathname.startsWith("/account") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin");

  // 1. Unauthenticated user → send to login.
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2. Read role from JWT user_metadata (no extra DB round-trip needed).
  //    Supabase sets app_metadata.role when you update profiles.role via service role.
  //    Falls back to user_metadata.role if present.
  //    NOTE: The authoritative admin check is done in requireAdmin() in the layout.
  const viewMode = request.cookies.get("view_mode")?.value;
  const jwtRole =
    (user?.app_metadata?.role as string | undefined) ??
    (user?.user_metadata?.role as string | undefined);

  // 3. Admins landing on /dashboard or /account (when not in learner-view) → send to /admin.
  if (
    user &&
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
  if (user && pathname.startsWith("/login")) {
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

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

async function readFreshRole(userId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=role`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) return null;
  const rows = (await response.json().catch(() => [])) as Array<{ role?: string }>;
  return rows[0]?.role ?? null;
}

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

  // Unauthenticated user trying to access a protected route -> send to login.
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const role = user ? await readFreshRole(user.id) : null;
  const viewMode = request.cookies.get("view_mode")?.value;

  if (user && role === "ADMIN" && viewMode !== "learner" && (pathname.startsWith("/dashboard") || pathname.startsWith("/account"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && role !== "ADMIN" && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/lessons";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Authenticated user trying to visit login -> send to the intended page or lessons.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    const nextPath = request.nextUrl.searchParams.get("next");
    url.pathname = role === "ADMIN" ? "/admin" : nextPath?.startsWith("/") && !nextPath.startsWith("/admin") ? nextPath : "/lessons";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

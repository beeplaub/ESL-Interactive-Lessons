import { NextResponse, type NextRequest } from "next/server";

const CALLBACK_PARAMETERS = ["code", "error", "error_code", "error_description", "error_uri"] as const;

export function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL("/auth/callback", request.url);

  for (const parameter of CALLBACK_PARAMETERS) {
    const value = requestUrl.searchParams.get(parameter);
    if (value) callbackUrl.searchParams.set(parameter, value);
  }

  const nextPath = requestUrl.searchParams.get("next");
  if (nextPath?.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("\\")) {
    callbackUrl.searchParams.set("next", nextPath);
  }

  return NextResponse.redirect(callbackUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

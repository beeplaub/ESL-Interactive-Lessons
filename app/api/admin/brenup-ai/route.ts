import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function gatewayUrl() {
  return process.env.BRENUP_AI_GATEWAY_URL?.replace(/\/$/, "") || null;
}

export async function GET() {
  await requireAdmin();
  const base = gatewayUrl();
  if (!base) return NextResponse.json({ connected: false, reason: "Gateway is not configured." });
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ connected: response.ok && data.status !== "offline", ...data });
  } catch {
    return NextResponse.json({ connected: false, reason: "The local BrenUp AI gateway is offline." });
  }
}

export async function POST(request: Request) {
  await requireAdmin();
  const base = gatewayUrl();
  if (!base) return NextResponse.json({ error: "The BrenUp AI gateway is not configured yet." }, { status: 503 });
  const body = await request.json().catch(() => null) as { message?: unknown; mode?: unknown; sessionId?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 12000) return NextResponse.json({ error: "Enter a message up to 12,000 characters." }, { status: 400 });
  try {
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.BRENUP_AI_GATEWAY_SECRET ? { authorization: `Bearer ${process.env.BRENUP_AI_GATEWAY_SECRET}` } : {}) },
      body: JSON.stringify({ message, mode: body?.mode === "audit" || body?.mode === "review" || body?.mode === "code-review" ? body.mode : "research", sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => ({ error: "The gateway returned an invalid response." }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "The local BrenUp AI gateway is offline or taking too long to respond." }, { status: 503 });
  }
}

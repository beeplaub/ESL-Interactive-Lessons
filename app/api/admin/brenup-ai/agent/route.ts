import { NextResponse } from "next/server";
import { agentAdmin, agentRequest, createSession, session, sessions } from "@/lib/ai/creator-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent request failed.";
  const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : message === "SESSION_NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}
export async function GET(request: Request) {
  try {
    const userId = await agentAdmin();
    const id = new URL(request.url).searchParams.get("sessionId");
    return NextResponse.json(id ? { session: await session(userId,id) } : { sessions: await sessions(userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await agentAdmin();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status:403 });
    const text = await request.text();
    if (text.length>150000) throw new Error("Request is too large.");
    const body = JSON.parse(text);
    return NextResponse.json({ session: body.command === "create" ? await createSession(userId) : await agentRequest(userId,body) });
  } catch(error) { return failure(error); }
}

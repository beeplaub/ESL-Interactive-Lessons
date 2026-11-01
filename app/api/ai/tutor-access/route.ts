import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishAiTutorSession, getAiTutorAccess, reserveAiTutorSession } from "@/lib/aiTutorAccess";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use AI Tutor." }, { status: 401 });
  try {
    return NextResponse.json(await getAiTutorAccess(user.id));
  } catch {
    return NextResponse.json({ error: "AI Tutor access is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to use AI Tutor." }, { status: 401 });
  const body = await request.json().catch(() => null) as { action?: string; requestedMinutes?: number; sessionId?: string; cancel?: boolean } | null;
  if (body?.action === "finish") {
    if (!body.sessionId || typeof body.sessionId !== "string") return NextResponse.json({ error: "Invalid tutor session." }, { status: 400 });
    try {
      await finishAiTutorSession(user.id, body.sessionId, body.cancel === true);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "AI Tutor usage could not be finalized." }, { status: 503 });
    }
  }
  const requested = Number(body?.requestedMinutes);
  if (!Number.isInteger(requested) || requested < 1 || requested > 60) return NextResponse.json({ error: "Choose a lesson length from 1 to 60 minutes." }, { status: 400 });
  try {
    const result = await reserveAiTutorSession(user.id, requested);
    if (!result.ok) {
      return NextResponse.json({ ...result, error: result.reason === "NO_ACCESS" ? "AI Tutor access has not been assigned to your account." : "Your AI Tutor minute allowance is used up." }, { status: result.reason === "NO_ACCESS" ? 403 : 429 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI Tutor access is temporarily unavailable." }, { status: 503 });
  }
}

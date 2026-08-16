import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 8192) return NextResponse.json({ error: "A valid push token is required." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("push_devices").upsert({
    user_id: userId, token, platform: "WEB", user_agent: request.headers.get("user-agent"), enabled: true,
    last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "token" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ success: true });
  const admin = createAdminClient();
  await admin.from("push_devices").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("token", token);
  return NextResponse.json({ success: true });
}

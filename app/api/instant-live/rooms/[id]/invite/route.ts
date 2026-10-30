import { NextResponse } from "next/server";
import { isPlatformAdmin, requireStaff } from "@/lib/auth";
import { authorizeBookingScope, type BookingScope } from "@/lib/instant-live/booking-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireStaff();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const scopesInput = body?.scopes;
  const selectedInput = body?.inviteeIds;
  if (!Array.isArray(scopesInput) || !scopesInput.length || scopesInput.length > 20 || !Array.isArray(selectedInput)) {
    return NextResponse.json({ error: "Choose one or more managed classes or courses and learners." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: room } = await admin.from("instant_live_rooms")
    .select("id,creator_id,title,join_code,status,expires_at")
    .eq("id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "This live class is unavailable." }, { status: 404 });
  if (room.creator_id !== user.id && !isPlatformAdmin(profile?.role)) {
    return NextResponse.json({ error: "Only the class host can invite learners." }, { status: 403 });
  }
  if (room.status !== "LIVE" || Date.parse(room.expires_at) <= Date.now()) {
    return NextResponse.json({ error: "Invitations can be sent while the class is live." }, { status: 409 });
  }

  const eligible = new Set<string>();
  for (const item of scopesInput) {
    const scope: BookingScope = { scopeType: item?.scopeType, scopeId: String(item?.scopeId ?? "") };
    if (!(scope.scopeType === "CLASS" || scope.scopeType === "COURSE") || !/^[0-9a-f-]{36}$/i.test(scope.scopeId)) {
      return NextResponse.json({ error: "Invalid class or course selection." }, { status: 400 });
    }
    const result = await authorizeBookingScope(scope, user.id, profile?.role);
    if (!result) return NextResponse.json({ error: "You can only invite learners from classes or courses you manage." }, { status: 403 });
    result.eligibleLearners.forEach(learnerId => eligible.add(learnerId));
  }

  const inviteeIds = [...new Set((selectedInput as unknown[]).map(value => String(value)))];
  if (!inviteeIds.length || inviteeIds.length > 500 || inviteeIds.some(learnerId => !eligible.has(learnerId))) {
    return NextResponse.json({ error: "Choose valid learners from the selected audience." }, { status: 400 });
  }

  const results = await notifyUsers(inviteeIds, {
    type: "LIVE_CLASS_INVITED",
    title: "You’re invited to a live class",
    detail: `${room.title} is live now. Open the invitation to check the class status and join.`,
    href: `/live/join/${encodeURIComponent(room.join_code)}`,
    tone: "green",
    channels: ["IN_APP", "PUSH"],
  });
  const sentCount = results.filter(Boolean).length;
  if (!sentCount) return NextResponse.json({ error: "Invitations could not be delivered. Please try again." }, { status: 503 });
  return NextResponse.json({ sentCount, requestedCount: inviteeIds.length });
}

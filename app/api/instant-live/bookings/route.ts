import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { authorizeBookingScope, type BookingScope } from "@/lib/instant-live/booking-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

export async function POST(request: Request) {
  const { user, profile } = await requireStaff();
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim().slice(0, 120);
  const description = String(body?.description ?? "").trim().slice(0, 500) || null;
  const dateValue = String(body?.scheduledStartAt ?? "");
  const timezone = String(body?.timezone ?? "");
  const durationMinutes = Number(body?.durationMinutes ?? 60);
  const accessMode = body?.accessMode === "LINK" ? "LINK" : "INVITED";
  const roomLocked = Boolean(body?.roomLocked);
  const scopesInput = body?.scopes;
  const selectedInput = body?.inviteeIds;
  const scheduledAt = new Date(dateValue);
  if (!title) return NextResponse.json({ error: "Add a class title." }, { status: 400 });
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000 || scheduledAt.getTime() > Date.now() + 366 * 24 * 60 * 60_000) return NextResponse.json({ error: "Choose a future date within the next year." }, { status: 400 });
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) return NextResponse.json({ error: "Class duration must be between 5 minutes and 8 hours." }, { status: 400 });
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return NextResponse.json({ error: "Choose a valid timezone." }, { status: 400 }); }
  if (!Array.isArray(scopesInput) || !scopesInput.length || scopesInput.length > 20 || !Array.isArray(selectedInput)) return NextResponse.json({ error: "Choose at least one class or course and its learners." }, { status: 400 });
  if (accessMode === "LINK" && body?.confirmOpenAccess !== true) return NextResponse.json({ error: "Confirm that anyone signed in with the class link can join." }, { status: 400 });

  const scopes: BookingScope[] = [];
  const eligible = new Set<string>();
  for (const item of scopesInput) {
    const scope: BookingScope = { scopeType: item?.scopeType, scopeId: String(item?.scopeId ?? "") };
    if (!(scope.scopeType === "CLASS" || scope.scopeType === "COURSE") || !/^[0-9a-f-]{36}$/i.test(scope.scopeId)) return NextResponse.json({ error: "Invalid audience selection." }, { status: 400 });
    const result = await authorizeBookingScope(scope, user.id, profile?.role);
    if (!result) return NextResponse.json({ error: "You can only schedule for classes or courses you manage." }, { status: 403 });
    scopes.push(scope); result.eligibleLearners.forEach(id => eligible.add(id));
  }
  const inviteeIds = [...new Set((selectedInput as unknown[]).map(value => String(value)))];
  if (!inviteeIds.length || inviteeIds.length > 500 || inviteeIds.some(id => !eligible.has(id))) return NextResponse.json({ error: "Choose valid learners from the selected audience." }, { status: 400 });

  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("instant_live_bookings").insert({
    creator_id: user.id, title, description, scheduled_start_at: scheduledAt.toISOString(), duration_minutes: durationMinutes,
    timezone, access_mode: accessMode, room_locked: roomLocked, status: "SCHEDULED",
  }).select("id,title,scheduled_start_at,duration_minutes").single();
  if (error || !booking) return NextResponse.json({ error: "Could not save this scheduled class." }, { status: 503 });

  const scopeRows = scopes.map(scope => ({ booking_id: booking.id, scope_type: scope.scopeType, class_id: scope.scopeType === "CLASS" ? scope.scopeId : null, course_id: scope.scopeType === "COURSE" ? scope.scopeId : null }));
  const { error: scopeError } = await admin.from("instant_live_booking_scopes").insert(scopeRows);
  const { error: inviteError } = scopeError ? { error: scopeError } : await admin.from("instant_live_booking_invitees").insert(inviteeIds.map(user_id => ({ booking_id: booking.id, user_id })));
  if (scopeError || inviteError) {
    await admin.from("instant_live_bookings").delete().eq("id", booking.id).eq("creator_id", user.id);
    return NextResponse.json({ error: "Could not save the class audience. Please review the selections and try again." }, { status: 503 });
  }
  await notifyUsers(inviteeIds, { type: "LIVE_CLASS_SCHEDULED", title: "Live class invitation", detail: `${title} is scheduled for ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(scheduledAt)}.`, href: `/live/invite/${booking.id}`, tone: "purple", dedupeKeyPrefix: `instant-live-booking:${booking.id}` });
  return NextResponse.json({ booking }, { status: 201 });
}

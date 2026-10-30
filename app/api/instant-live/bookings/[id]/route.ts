import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: booking } = await admin.from("instant_live_bookings").select("id,creator_id,title,scheduled_start_at,status").eq("id", id).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Scheduled class not found." }, { status: 404 });
  if (booking.creator_id !== user.id && profile?.role !== "ADMIN") return NextResponse.json({ error: "You can only edit a class you manage." }, { status: 403 });
  if (booking.status !== "SCHEDULED") return NextResponse.json({ error: "Only an upcoming class can be edited." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? booking.title).trim().slice(0, 120);
  const description = String(body?.description ?? "").trim().slice(0, 500) || null;
  const scheduledAt = new Date(String(body?.scheduledStartAt ?? ""));
  const timezone = String(body?.timezone ?? "");
  const durationMinutes = Number(body?.durationMinutes ?? 60);
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { return NextResponse.json({ error: "Choose a valid timezone." }, { status: 400 }); }
  if (!title || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000 || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) return NextResponse.json({ error: "Check the class title, future start time, and duration." }, { status: 400 });
  const { error } = await admin.from("instant_live_bookings").update({ title, description, scheduled_start_at: scheduledAt.toISOString(), timezone, duration_minutes: durationMinutes, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "SCHEDULED");
  if (error) return NextResponse.json({ error: "Could not update this class." }, { status: 503 });
  const { data: invitees } = await admin.from("instant_live_booking_invitees").select("user_id").eq("booking_id", id).eq("status", "INVITED");
  await notifyUsers((invitees ?? []).map(item => item.user_id), { type: "LIVE_CLASS_SCHEDULED", title: "Live class updated", detail: `${title} is now scheduled for ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(scheduledAt)}.`, href: `/live/invite/${id}`, tone: "purple", dedupeKeyPrefix: `instant-live-rescheduled:${id}:${scheduledAt.toISOString()}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: booking } = await admin.from("instant_live_bookings").select("id,creator_id,title,status").eq("id", id).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Scheduled class not found." }, { status: 404 });
  if (booking.creator_id !== user.id && profile?.role !== "ADMIN") return NextResponse.json({ error: "You can only cancel a class you manage." }, { status: 403 });
  if (booking.status !== "SCHEDULED") return NextResponse.json({ error: "Only an upcoming class can be cancelled here." }, { status: 409 });
  const { error } = await admin.from("instant_live_bookings").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "SCHEDULED");
  if (error) return NextResponse.json({ error: "Could not cancel this class." }, { status: 503 });
  const { data: invitees } = await admin.from("instant_live_booking_invitees").select("user_id").eq("booking_id", id).eq("status", "INVITED");
  await notifyUsers((invitees ?? []).map(item => item.user_id), { type: "LIVE_CLASS_CANCELLED", title: "Live class cancelled", detail: `${booking.title} has been cancelled.`, href: "/live-classes", tone: "orange", dedupeKeyPrefix: `instant-live-cancelled:${id}` });
  if (profile?.role === "ADMIN" && booking.creator_id !== user.id) await admin.from("instant_live_admin_audit").insert({ admin_id: user.id, booking_id: id, action: "CANCEL_BOOKING" });
  return NextResponse.json({ ok: true });
}

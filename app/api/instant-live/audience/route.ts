import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { authorizeBookingScope, type BookingScope } from "@/lib/instant-live/booking-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user, profile } = await requireStaff();
  const body = await request.json().catch(() => ({}));
  const scopes = body?.scopes;
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 20) return NextResponse.json({ error: "Select at least one class or course." }, { status: 400 });
  const members = new Set<string>();
  for (const item of scopes) {
    const scope: BookingScope = { scopeType: item?.scopeType, scopeId: String(item?.scopeId ?? "") };
    if (!(scope.scopeType === "CLASS" || scope.scopeType === "COURSE") || !/^[0-9a-f-]{36}$/i.test(scope.scopeId)) return NextResponse.json({ error: "Invalid audience selection." }, { status: 400 });
    const result = await authorizeBookingScope(scope, user.id, profile?.role);
    if (!result) return NextResponse.json({ error: "You can only invite learners in classes or courses you manage." }, { status: 403 });
    result.eligibleLearners.forEach(id => members.add(id));
  }
  const ids = [...members];
  const admin = createAdminClient();
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"]));
  return NextResponse.json({ learners: ids.map(id => ({ id, name: names.get(id) ?? "Learner" })).sort((a, b) => a.name.localeCompare(b.name)) }, { headers: { "Cache-Control": "private, no-store" } });
}

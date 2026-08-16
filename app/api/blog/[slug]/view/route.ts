import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,100}$/i.test(slug)) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  const { data: post } = await admin.from("blog_posts").select("id").eq("slug", slug).eq("status", "PUBLISHED").in("visibility", ["PUBLIC", "UNLISTED"]).is("deleted_at", null).maybeSingle();
  if (!post) return NextResponse.json({ ok: false }, { status: 404 });
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = `${forwarded}|${request.headers.get("user-agent") || "unknown"}|${new Date().toISOString().slice(0, 10)}`;
  const visitorKey = createHash("sha256").update(fingerprint).digest("hex");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await admin.rpc("record_blog_post_view", { input_post_id: post.id, input_visitor_key: visitorKey, input_user_id: user?.id || null });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

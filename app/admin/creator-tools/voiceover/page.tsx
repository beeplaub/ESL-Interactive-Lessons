import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatorEntitlements } from "@/lib/entitlements";
import { VoiceoverStudio } from "@/components/VoiceoverStudio";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceover";

export const dynamic = "force-dynamic";

type SearchParams = { lessonId?: string; slideId?: string; returnTo?: string };

export default async function VoiceoverStudioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, profile } = await requireStaff();
  const params = await searchParams;
  const admin = createAdminClient();
  const entitlements = await getCreatorEntitlements(user.id, profile?.role);
  const [{ data: flag }, { data: recent }, { data: lesson }, { data: slide }] = await Promise.all([
    admin.from("ai_feature_flags").select("enabled,allowed_roles").eq("feature_key", "creator_voiceover").maybeSingle(),
    admin.from("ai_voiceover_generations").select("id,title,public_url,voice_name,style,duration_seconds,saved_at,media_asset_id").eq("creator_id", user.id).eq("status", "SAVED").order("saved_at", { ascending: false }).limit(8),
    params.lessonId ? admin.from("lessons").select("id,title,created_by").eq("id", params.lessonId).maybeSingle() : Promise.resolve({ data: null }),
    params.slideId ? admin.from("slides").select("id,title,slide_number,lesson_id").eq("id", params.slideId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const role = profile?.role ?? "LEARNER";
  const featureAllowed = flag ? flag.enabled && (flag.allowed_roles ?? []).includes(role) : role === "ADMIN";
  const canUse = featureAllowed && entitlements.values.AI_CREATOR.enabled;
  const contextValid = Boolean(lesson && slide && slide.lesson_id === lesson.id && (role === "ADMIN" || lesson.created_by === user.id));
  if ((params.lessonId || params.slideId) && !contextValid) redirect("/admin/creator-tools/voiceover");

  return (
    <VoiceoverStudio
      canUse={canUse}
      accessMessage={!featureAllowed ? "AI Voiceover is not enabled for your role." : !entitlements.values.AI_CREATOR.enabled ? `${entitlements.planName} does not include AI Creator Tools.` : null}
      voices={[...VOICEOVER_VOICES]}
      styles={[...VOICEOVER_STYLES]}
      paces={[...VOICEOVER_PACES]}
      recentVoiceovers={recent ?? []}
      lessonContext={contextValid && lesson && slide ? {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        slideId: slide.id,
        slideTitle: slide.title,
        slideNumber: slide.slide_number,
        returnTo: params.returnTo || `/admin/lessons/${lesson.id}/builder`,
      } : null}
    />
  );
}


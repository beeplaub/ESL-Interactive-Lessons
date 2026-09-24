import { Sparkles } from "lucide-react";
import { ActivitiesLibrary } from "@/components/ActivitiesLibrary";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasPracticeLibraryAccess } from "@/lib/practiceAccess";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: modules } = await (createAdminClient() as any).from("practice_modules").select("id,title,description,category,level,access_type,feature_image_path").eq("status", "PUBLISHED").order("updated_at", { ascending: false });
  const hasPremiumAccess = user ? await hasPracticeLibraryAccess(user.id) : false;
  return (
    <LearnerAppShell active="home" showRightSidebar={false}>
      <section className="rounded-[24px] bg-[var(--br-dark-card)] p-5 text-on-dark shadow-[var(--br-shadow)] sm:p-7">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--br-action)] text-white"><Sparkles size={21} /></div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/60">Practice Library</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Build skill through focused practice.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Explore short, topic-focused learning modules built from BrenUp’s interactive practice activities.</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--br-border)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-6">
        <div className="border-b border-[var(--br-border)] pb-4"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Practice collection</p><h2 className="mt-1 text-xl font-extrabold">Choose a skill to practise</h2></div>
        <div className="mt-5"><ActivitiesLibrary modules={modules ?? []} hasPremiumAccess={hasPremiumAccess} isAuthenticated={Boolean(user)} /></div>
      </section>
    </LearnerAppShell>
  );
}

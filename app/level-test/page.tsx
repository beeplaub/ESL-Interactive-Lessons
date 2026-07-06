import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, CheckCircle2, Clock3, FileQuestion, ShieldCheck, Sparkles, Target } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { getPublishedLevelTest } from "@/lib/configurableLevelTest";
import { createClient } from "@/lib/supabase/server";

export default async function LevelTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const test = await getPublishedLevelTest();
  const questionCount = test.sections.reduce((sum, section) => sum + section.questions.length, 0);
  const startHref = user ? "/level-test/test" : `/login?next=${encodeURIComponent("/level-test/test")}`;

  return (
    <LearnerAppShell active="level-test">
      <section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_18px_52px_rgba(20,23,80,.28)] sm:p-6">
            <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#6C3BFF]/25" />
            <div className="absolute right-32 top-20 size-24 rounded-full bg-[#38BDF8]/20 blur-xl" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80"><Sparkles className="size-4" /> CEFR level check</span>
              <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{test.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">{test.description}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <InfoPill icon={FileQuestion} text={`${questionCount} questions`} />
                <InfoPill icon={Clock3} text={test.durationSeconds ? `${Math.round(test.durationSeconds / 60)} minutes` : "No time limit"} />
                <InfoPill icon={BadgeCheck} text="A1–C2 result" />
              </div>
              <Link href={startHref} className="mt-5 inline-flex items-center gap-2 rounded-[14px] bg-white px-5 py-3 text-sm font-extrabold text-[#6C3BFF] shadow-[0_10px_28px_rgba(0,0,0,.16)]">
                Start level test <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-6">
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-[14px] bg-[#EEEAFB] text-[#6C3BFF]"><Target className="size-5" /></span><div><h2 className="text-lg font-extrabold">What happens next</h2><p className="text-xs font-semibold text-[#8B90A7]">A clear reference point for your learning.</p></div></div>
              <div className="mt-5 grid gap-3">
                <Benefit icon={ShieldCheck} title="Take a balanced assessment" text="Work through language-use and reading questions selected for this attempt." />
                <Benefit icon={BadgeCheck} title="Receive your CEFR level" text="Your weighted performance is mapped from A1 to C2." />
                <Benefit icon={BookOpen} title="Get practical guidance" text="See strengths, section scores, and suitable next practice." />
              </div>
            </div>
            <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
              <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#00C98D]" /><p className="text-sm font-semibold leading-6 text-[#4E536B]">{test.instructions || "Choose the best answer you can. Your result is a helpful guide, not a limit on what you can learn."}</p></div>
            </div>
          </div>
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {test.sections.map((section, index) => (
            <div key={section.id} className="rounded-[18px] border border-[#ECECF5] bg-white p-5 shadow-[0_10px_28px_rgba(0,0,0,.05)]">
              <span className="grid size-9 place-items-center rounded-[12px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-sm font-black text-white">{index + 1}</span>
              <h2 className="mt-4 text-base font-extrabold">{section.title}</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#6E738D]">{section.description}</p>
              <p className="mt-3 text-xs font-extrabold text-[#6C3BFF]">{section.questions.length} questions in this attempt</p>
            </div>
          ))}
        </section>
      </section>
    </LearnerAppShell>
  );
}

function InfoPill({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white/85"><Icon className="size-4 text-[#67D9FF]" />{text}</span>;
}
function Benefit({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return <div className="flex gap-3 rounded-[14px] bg-[#F8F8FC] p-3"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-white text-[#6C3BFF] shadow-sm"><Icon className="size-4" /></span><div><h3 className="text-sm font-extrabold">{title}</h3><p className="mt-0.5 text-xs font-semibold leading-5 text-[#6E738D]">{text}</p></div></div>;
}

import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock3, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function LevelTestPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const startHref = user ? "/level-test/test" : `/login?next=${encodeURIComponent("/level-test/test")}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm md:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_320px] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">Free CEFR level test</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">Find out your English level.</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-black/65">
              Take a 25-question English level test based on Cambridge-style CEFR bands. You’ll get your level plus practical guidance on what to study next.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-black/65 sm:grid-cols-3">
              <span className="flex items-center gap-2"><ClipboardList className="text-moss" size={18} /> 25 questions</span>
              <span className="flex items-center gap-2"><Clock3 className="text-moss" size={18} /> 30 minutes</span>
              <span className="flex items-center gap-2"><BadgeCheck className="text-moss" size={18} /> A1 to C2 result</span>
            </div>
            <Link href={startHref} className="mt-8 inline-flex items-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white">
              Start Test <ArrowRight size={16} />
            </Link>
          </div>
          <div className="rounded-lg bg-skywash p-5">
            <h2 className="font-semibold">What you’ll receive</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-black/70">
              <li>A CEFR level badge: A1, A2, B1, B2, C1, or C2.</li>
              <li>A Use of English and Reading score breakdown.</li>
              <li>A warm guidance card with next-step study advice.</li>
              <li>Your level saved to My Account for reference.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

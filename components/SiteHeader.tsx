import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/SiteNav";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-[1540px] items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-3 font-semibold tracking-tight">
          <span className="relative grid size-10 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-violetglow via-electric to-midnight text-sm font-black text-white shadow-lg shadow-violetglow/20">
            <span className="absolute -left-2 top-1 h-7 w-7 rounded-full bg-white/20" />
            B
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-black text-midnight">BrenUp</span>
            <span className="hidden text-[11px] font-medium text-slate-500 sm:block">Level Up Your English</span>
          </span>
        </Link>
        <SiteNav isLoggedIn={Boolean(user)} />
      </nav>
    </header>
  );
}

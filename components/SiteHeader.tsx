import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/SiteNav";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-md bg-moss text-sm text-white">B</span>
          <span>BrenUp</span>
        </Link>
        <SiteNav isLoggedIn={Boolean(user)} />
      </nav>
    </header>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/SiteNav";
import { BrandLogo } from "@/components/BrandLogo";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--br-border)] bg-[color:color-mix(in_srgb,var(--br-surface)_88%,transparent)] backdrop-blur-xl">
      <nav className="mx-auto flex max-w-[1540px] items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center font-semibold tracking-tight">
          <BrandLogo variant="light" className="h-10 w-[132px]" priority />
        </Link>
        <SiteNav isLoggedIn={Boolean(user)} />
      </nav>
    </header>
  );
}

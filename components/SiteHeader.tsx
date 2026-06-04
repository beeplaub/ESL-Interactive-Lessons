import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

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
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="hidden rounded-md px-3 py-2 hover:bg-black/5 sm:inline-flex">
            Lessons
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 hover:bg-black/5">
                <UserRound size={16} /> My Account
              </Link>
              <form action={signOut}>
                <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-black/65 hover:bg-black/5 hover:text-black">
                  <LogOut size={16} /> Logout
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-moss px-3 py-2 font-medium text-white">
              <UserRound size={16} /> My Account
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

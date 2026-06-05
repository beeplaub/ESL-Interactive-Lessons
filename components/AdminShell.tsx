import Link from "next/link";
import { BarChart3, BookOpen, ClipboardList, FlaskConical, LogOut, UsersRound } from "lucide-react";
import { signOut, switchToLearnerView } from "@/app/auth/actions";

const links = [
  { href: "/admin", label: "Overview", Icon: BarChart3 },
  { href: "/admin/lessons", label: "Lessons", Icon: BookOpen },
  { href: "/admin/quizzes", label: "Quizzes", Icon: ClipboardList },
  { href: "/admin/users", label: "Users", Icon: UsersRound },
  { href: "/admin/level-test", label: "Level Test", Icon: FlaskConical }
];

export function AdminShell({ name, children }: { name: string | null | undefined; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 overflow-hidden px-3 py-4 sm:px-4 sm:py-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-lg border border-black/10 bg-white p-3 shadow-sm md:sticky md:top-20 md:h-[calc(100vh-96px)]">
        <div className="border-b border-black/10 p-3">
          <p className="text-xs uppercase tracking-wide text-black/50">Admin</p>
          <p className="mt-1 truncate font-semibold">{name ?? "BrenUp"}</p>
        </div>
        <nav className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
          {links.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="inline-flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-black/5">
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <form action={switchToLearnerView} className="mt-4">
          <button className="inline-flex w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
            Switch to Learner View
          </button>
        </form>
        <form action={signOut} className="mt-2 md:absolute md:bottom-3 md:left-3 md:right-3">
          <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-black/60 hover:bg-black/5">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </aside>
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

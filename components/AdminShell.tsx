import Link from "next/link";
import { BarChart3, BookOpen, ClipboardList, FlaskConical, LogOut, UsersRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";

const links = [
  { href: "/admin", label: "Overview", Icon: BarChart3 },
  { href: "/admin/lessons", label: "Lessons", Icon: BookOpen },
  { href: "/admin/quizzes", label: "Quizzes", Icon: ClipboardList },
  { href: "/admin/users", label: "Users", Icon: UsersRound },
  { href: "/admin/level-test", label: "Level Test", Icon: FlaskConical }
];

export function AdminShell({ name, children }: { name: string | null | undefined; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-[220px_1fr]">
      <aside className="rounded-lg border border-black/10 bg-white p-3 shadow-sm md:sticky md:top-20 md:h-[calc(100vh-96px)]">
        <div className="border-b border-black/10 p-3">
          <p className="text-xs uppercase tracking-wide text-black/50">Admin</p>
          <p className="mt-1 truncate font-semibold">{name ?? "BrenUp"}</p>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto md:grid">
          {links.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-black/5">
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-4 md:absolute md:bottom-3 md:left-3 md:right-3">
          <button className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-black/60 hover:bg-black/5">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </aside>
      <div>{children}</div>
    </div>
  );
}

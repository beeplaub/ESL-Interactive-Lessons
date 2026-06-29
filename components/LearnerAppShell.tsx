import Link from "next/link";
import {
  BarChart2,
  Bell,
  BookOpen,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  Target,
  Trophy,
  User,
  Users
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const levelNames: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery"
};

type ActiveItem = "home" | "quizzes" | "courses" | "level-test" | "leaderboard" | "profile";

export async function LearnerAppShell({ active, children }: { active: ActiveItem; children: React.ReactNode }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await admin.from("profiles").select("first_name,last_name,full_name,cefr_level").eq("id", user.id).maybeSingle()
    : { data: null };

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "Guest";
  const initials = name.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || "BU";
  const currentLevel = profile?.cefr_level || null;

  return (
    <main className="min-h-screen bg-[#F6F7FB] font-sans text-[#14172B]">
      <MobileTopbar active={active} initials={initials} isLoggedIn={Boolean(user)} />
      <div className="mx-auto flex min-h-screen max-w-[1536px] items-start gap-5 p-3 pb-24 md:p-6 md:pb-6">
        <LearnerSidebar active={active} currentLevel={currentLevel} />
        <section className="flex min-w-0 flex-1 flex-col gap-5 pt-[60px] md:pt-0">
          {children}
        </section>
      </div>
      <MobileBottomNav active={active} />
    </main>
  );
}

function LearnerSidebar({ active, currentLevel }: { active: ActiveItem; currentLevel: string | null }) {
  const navItems = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: GraduationCap, key: "courses" },
    { href: "/level-test", label: "Level Test", icon: Target, key: "level-test" },
    { href: "/leaderboard", label: "Leaderboard", icon: BarChart2, key: "leaderboard" },
    { href: "#", label: "Community", icon: Users, key: "community", disabled: true, badge: "NEW" }
  ];

  return (
    <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] w-[225px] min-w-[225px] flex-col overflow-y-auto rounded-[24px] bg-gradient-to-b from-[#09112C] to-[#0C1636] p-5 [scrollbar-width:none] min-[861px]:flex [&::-webkit-scrollbar]:hidden">
      <Link href="/" className="flex items-center gap-2.5 pb-5">
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]">
          <Layers className="size-[22px] text-white" />
        </div>
        <div>
          <div className="text-base font-bold leading-tight text-white">BrenUp</div>
          <div className="text-[10px] font-medium text-[#8890B8]">Level Up Your English</div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ key, ...item }) => (
          <NavItem key={item.label} {...item} active={active === key} />
        ))}
      </nav>
      {currentLevel ? (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Current CEFR Level</div>
          <div className="text-[40px] font-extrabold leading-none">{currentLevel}</div>
          <div className="mb-3 text-xs opacity-80">{levelNames[currentLevel] ?? "English level"}</div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-white to-white/70" />
          </div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            View Level Roadmap <ChevronRight className="size-[13px]" />
          </Link>
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-[18px] text-white">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">Find Your Level</div>
          <div className="text-[30px] font-extrabold leading-none">A1-C2</div>
          <div className="mb-3 mt-1 text-xs opacity-80">Take the free CEFR check and get a learning direction.</div>
          <Link href="/level-test" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 p-2.5 text-xs font-semibold text-white">
            Take Level Test <ChevronRight className="size-[13px]" />
          </Link>
        </div>
      )}
      <ChallengeCard compact />
    </aside>
  );
}

function ChallengeCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mt-3 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#6C3BFF] to-[#172BB8] text-white shadow-[0_12px_28px_rgba(108,59,255,.28)] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">Challenge yourself!</div>
          <p className="mt-1.5 text-[11px] leading-5 text-white/70">Join a quiz challenge and earn points toward your next badge.</p>
          <Link href="/quizzes" className="mt-4 inline-flex rounded-xl bg-gradient-to-br from-[#8A58FF] to-[#6C3BFF] px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,.16)]">
            Join Now
          </Link>
        </div>
        <div className="text-4xl">🏆</div>
      </div>
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active, disabled, badge }: { href: string; label: string; icon: React.ElementType; active?: boolean; disabled?: boolean; badge?: string }) {
  const className = `flex h-12 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold no-underline transition ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white shadow-[0_8px_20px_rgba(108,59,255,.35)]" : "text-[#C5C8DC] hover:bg-[#6C3BFF]/20 hover:text-white"} ${disabled ? "cursor-default opacity-80" : ""}`;
  const content = <><span className="grid size-5 shrink-0 place-items-center"><Icon className="size-[18px]" /></span><span>{label}</span>{badge ? <span className="ml-auto rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">{badge}</span> : null}</>;
  if (disabled) return <span className={className}>{content}</span>;
  return <Link href={href} className={className}>{content}</Link>;
}

function MobileTopbar({ active, initials, isLoggedIn }: { active: ActiveItem; initials: string; isLoggedIn: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between bg-gradient-to-br from-[#09112C] to-[#0C1636] px-4 min-[861px]:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-[9px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF]"><Layers className="size-[18px] text-white" /></span>
        <span className="text-[15px] font-bold text-white">BrenUp</span>
      </Link>
      <div className="flex items-center gap-2.5">
        <div className="relative grid size-9 place-items-center text-white"><Bell className="size-5" /><span className="absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full border border-[#09112C] bg-[#FF5D73] text-[8px] font-bold">3</span></div>
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-xs font-black text-white">{initials}</span>
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-[10px] text-white marker:hidden [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="size-[22px]" /></summary>
          <div className="fixed inset-x-3 top-[68px] z-50 rounded-[24px] border border-white/10 bg-[#09112C] p-3 shadow-2xl shadow-black/30">
            <div className="grid gap-1">
              <MobileDrawerLink href="/account" label="Home" icon={Home} active={active === "home"} />
              <MobileDrawerLink href="/quizzes" label="Quizzes" icon={HelpCircle} active={active === "quizzes"} />
              <MobileDrawerLink href="/courses" label="Courses" icon={GraduationCap} active={active === "courses"} />
              <MobileDrawerLink href="/level-test" label="Level Test" icon={Target} active={active === "level-test"} />
              <MobileDrawerLink href="/leaderboard" label="Leaderboard" icon={Trophy} active={active === "leaderboard"} />
              <MobileDrawerLink href={isLoggedIn ? "/profile" : "/login"} label={isLoggedIn ? "Profile" : "My Account"} icon={User} active={active === "profile"} />
              {isLoggedIn ? (
                <form action={signOut} className="mt-1 border-t border-white/10 pt-2">
                  <button className="flex h-11 w-full items-center gap-3 rounded-[14px] px-3.5 text-left text-sm font-semibold text-[#C5C8DC]" type="submit">
                    <LogOut className="size-[18px]" /> Logout
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function MobileDrawerLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active?: boolean }) {
  return <Link href={href} className={`flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-sm font-semibold ${active ? "bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white" : "text-[#C5C8DC]"}`}><Icon className="size-[18px]" /> {label}</Link>;
}

function MobileBottomNav({ active }: { active: ActiveItem }) {
  const items = [
    { href: "/account", label: "Home", icon: Home, key: "home" },
    { href: "/quizzes", label: "Quizzes", icon: HelpCircle, key: "quizzes" },
    { href: "/courses", label: "Courses", icon: BookOpen, key: "courses" },
    { href: "/leaderboard", label: "Ranks", icon: Trophy, key: "leaderboard" },
    { href: "/profile", label: "Profile", icon: User, key: "profile" }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ECECF5] bg-white px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 min-[861px]:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold ${active === item.key ? "text-[#6C3BFF]" : "text-[#6E738D]"}`}>
            <span className={`grid size-9 place-items-center rounded-[10px] ${active === item.key ? "bg-[#6C3BFF]/10" : ""}`}><item.icon className="size-5" /></span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

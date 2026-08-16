import Link from "next/link";
import { ArrowLeft, BarChart3, Eye, FileText, UsersRound } from "lucide-react";

export type BlogMetricRow = { metricDate: string; views: number; uniqueVisitors: number };
export type BlogTopPost = { id: string; title: string; slug: string; views: number; uniqueVisitors: number; publishedAt: string | null };

export function BlogAnalyticsWorkspace({ daily, topPosts, publishedCount }: { daily: BlogMetricRow[]; topPosts: BlogTopPost[]; publishedCount: number }) {
  const views = daily.reduce((total, item) => total + item.views, 0);
  const visitors = daily.reduce((total, item) => total + item.uniqueVisitors, 0);
  const max = Math.max(1, ...daily.map((item) => item.views));
  const firstDay = daily[0];
  const lastDay = daily.at(-1);

  return <main className="min-w-0 space-y-5">
    <header className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
      <Link href="/admin/blog" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--br-brand)]"><ArrowLeft size={16} /> Back to BrenUp Journal</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">First-party Journal analytics</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">What readers are discovering</h1><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Unique daily reading activity from BrenUp itself. No raw visitor addresses are retained.</p></div><a href="https://analytics.google.com/" target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Open Google Analytics</a></div>
    </header>
    <section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Views in 30 days" value={views} detail="One view per reader per article each day" Icon={Eye} /><MetricCard label="Unique readers" value={visitors} detail="Privacy-conscious daily readers" Icon={UsersRound} /><MetricCard label="Published articles" value={publishedCount} detail="Live, public Journal stories" Icon={FileText} /></section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center gap-2"><BarChart3 size={18} className="text-[var(--br-brand)]" /><h2 className="font-bold text-ink">Daily views</h2></div><div className="mt-6 flex h-52 items-end gap-1.5">{daily.map((item) => <div key={item.metricDate} className="group relative flex h-full min-w-0 flex-1 items-end"><div className="w-full rounded-t-md bg-[var(--br-brand)]/80 transition group-hover:bg-[var(--br-brand)]" style={{ height: `${Math.max(item.views ? 8 : 2, (item.views / max) * 100)}%` }} /><div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-32 -translate-x-1/2 rounded-lg bg-[var(--br-dark-card)] px-2 py-1.5 text-center text-[10px] font-bold text-on-dark shadow-lg group-hover:block">{formatDay(item.metricDate)}<br />{item.views} views · {item.uniqueVisitors} readers</div></div>)}</div><div className="mt-3 flex justify-between text-[10px] font-semibold text-[var(--br-text-muted)]"><span>{firstDay ? formatDay(firstDay.metricDate) : "No data"}</span><span>{lastDay ? formatDay(lastDay.metricDate) : ""}</span></div>{!daily.some((item) => item.views) ? <p className="mt-5 rounded-xl bg-[var(--br-surface-muted)] p-3 text-sm text-[var(--br-text-muted)]">Published database articles will begin appearing here once readers open them.</p> : null}</section>
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><h2 className="font-bold text-ink">Top articles</h2><div className="mt-3 divide-y divide-[var(--br-border)]">{topPosts.map((post, index) => <div key={post.id} className="flex items-center gap-3 py-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--br-surface-muted)] text-xs font-black text-[var(--br-brand)]">{index + 1}</span><div className="min-w-0 flex-1"><Link href={`/admin/blog/${post.id}/edit`} className="block truncate text-sm font-bold text-ink hover:text-[var(--br-brand)]">{post.title}</Link><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{post.views} views · {post.uniqueVisitors} readers</p></div></div>)}{!topPosts.length ? <p className="py-8 text-center text-sm text-[var(--br-text-muted)]">No published database articles yet.</p> : null}</div></section>
    </div>
    <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 text-sm leading-6 text-[var(--br-text-muted)] shadow-sm"><h2 className="font-bold text-ink">What this report measures</h2><p className="mt-2">BrenUp records one daily view per article and visitor fingerprint. It helps you see which ideas are being read without storing raw IP addresses. Search impressions, Google ranking and external referral data stay in Google Analytics/Search Console, where their specialist reporting is stronger.</p></section>
  </main>;
}

function formatDay(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)); }

function MetricCard({ label, value, detail, Icon }: { label: string; value: number; detail: string; Icon: typeof Eye }) { return <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--br-text-muted)]">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{new Intl.NumberFormat("en").format(value)}</p></div><div className="grid size-9 place-items-center rounded-xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]"><Icon size={17} /></div></div><p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">{detail}</p></div>; }

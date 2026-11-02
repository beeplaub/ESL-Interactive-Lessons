export default function LoadingIpaChart() {
  return <div className="mx-auto max-w-6xl p-8 pt-24" role="status" aria-label="Loading IPA chart"><div className="h-10 w-72 rounded-xl bg-[var(--br-surface-muted)]" /><div className="mt-7 grid grid-cols-4 gap-3 sm:grid-cols-8">{Array.from({ length: 40 }, (_, index) => <div key={index} className="h-24 rounded-xl bg-[var(--br-surface-muted)] motion-safe:animate-pulse" />)}</div><span className="sr-only">Loading IPA chart…</span></div>;
}

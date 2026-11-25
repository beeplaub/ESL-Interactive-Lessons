export function PracticeActivityHeading({
  label,
  prompt,
  description,
  className = "",
}: {
  label: string;
  prompt?: string | null;
  description?: string | null;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">{label}</p>
      {prompt?.trim() ? <p className="mt-1 max-w-3xl text-lg font-extrabold leading-snug text-[var(--br-dark-card)] [overflow-wrap:anywhere] sm:text-xl">{prompt}</p> : null}
      {description?.trim() ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">{description.trim()}</p> : null}
    </div>
  );
}

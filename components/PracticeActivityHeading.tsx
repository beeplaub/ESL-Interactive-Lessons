export function PracticeActivityHeading({
  label,
  prompt,
  promptClassName = "",
  description,
  className = "",
}: {
  label?: string | null;
  prompt?: string | null;
  promptClassName?: string;
  description?: string | null;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label?.trim() ? <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">{label}</p> : null}
      {prompt?.trim() ? <p className={`mt-1 max-w-3xl text-lg font-extrabold leading-snug text-[var(--br-dark-card)] [overflow-wrap:anywhere] sm:text-xl ${promptClassName}`}>{prompt}</p> : null}
      {description?.trim() ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">{description.trim()}</p> : null}
    </div>
  );
}

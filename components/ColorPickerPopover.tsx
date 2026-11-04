"use client";

import { useState, type ReactNode } from "react";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function ColorPickerPopover({
  label,
  value,
  defaultValue,
  onApply,
  kind = "swatch",
  children,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onApply: (value: string) => void;
  kind?: "font" | "swatch";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || defaultValue);

  function showPicker() {
    setDraft(value || defaultValue);
    setOpen(true);
  }

  function cancel() {
    setDraft(value || defaultValue);
    setOpen(false);
  }

  function apply() {
    if (!HEX_COLOR.test(draft)) return;
    onApply(draft.toUpperCase());
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={showPicker}
        className={kind === "font"
          ? "grid size-8 place-items-center rounded-lg text-sm font-black text-[var(--br-text)] hover:bg-[var(--br-surface-muted)]"
          : "grid size-7 place-items-center rounded-md border border-[var(--br-border)] bg-[var(--br-surface-muted)]"}
      >
        {children || (kind === "font" ? <span className="border-b-2 px-1" style={{ borderColor: value || defaultValue }}>A</span> : <span className="size-4 rounded-sm border border-black/15" style={{ backgroundColor: value || defaultValue }} />)}
      </button>
      {open ? (
        <div role="dialog" aria-label={label} className="absolute right-0 top-full z-[80] mt-2 w-64 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-2">
            <input aria-label={`${label} native color picker`} type="color" value={draft} onChange={(event) => setDraft(event.target.value.toUpperCase())} className="size-10 cursor-pointer rounded-lg border border-[var(--br-border)] bg-white p-1" />
            <label className="min-w-0 flex-1 text-[11px] font-semibold text-[var(--br-text-muted)]">Hex color
              <input aria-label={`${label} hex value`} value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (HEX_COLOR.test(draft)) setDraft(draft.toUpperCase()); }} className={`mt-1 h-9 w-full rounded-lg border bg-[var(--br-surface)] px-2 font-mono text-sm uppercase text-[var(--br-text)] outline-none focus:border-[var(--br-brand)] ${HEX_COLOR.test(draft) ? "border-[var(--br-border)]" : "border-red-400"}`} />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={cancel} className="rounded-lg border border-[var(--br-border)] px-3 py-1.5 text-xs font-semibold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Cancel</button>
            <button type="button" disabled={!HEX_COLOR.test(draft)} onClick={apply} className="rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

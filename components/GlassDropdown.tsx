"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type GlassDropdownOption = { value: string; label: string };

export function GlassDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName = "",
  align = "left",
}: {
  value: string;
  options: GlassDropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  triggerClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex h-10 max-w-full items-center justify-between gap-3 rounded-xl border border-[var(--br-surface-strong)] bg-surface px-3.5 text-sm font-semibold text-[var(--br-text)] shadow-[var(--br-shadow)] transition hover:border-[var(--br-chart-primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]/20 ${triggerClassName}`}
      >
        <span className="truncate">{selected?.label ?? "Choose"}</span>
        <ChevronDown className={`size-4 shrink-0 text-[var(--br-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-[calc(100%+8px)] z-50 min-w-full overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-1.5 shadow-[0_18px_48px_rgba(35,31,68,0.18)] backdrop-blur-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-5 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]/20 ${isSelected ? "bg-[var(--br-chart-primary)]/10 font-bold text-[var(--br-chart-primary)]" : "font-medium text-[var(--br-text)] hover:bg-white/80"}`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {isSelected ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

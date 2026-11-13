"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type GlassDropdownOption = { value: string; label: string };

export function GlassDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName = "",
  align = "left",
  portal = false,
}: {
  value: string;
  options: GlassDropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  triggerClassName?: string;
  align?: "left" | "right";
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
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

  useEffect(() => {
    if (!open || !portal) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const menuHeight = Math.min(280, options.length * 44 + 12);
      const below = rect.bottom + 8;
      const top = below + menuHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - menuHeight - 8);
      setPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length, portal]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      style={portal ? { position: "fixed", top: position?.top ?? -1000, left: position?.left ?? -1000, width: position?.width ?? 220 } : undefined}
      className={`z-[1000] max-h-[280px] overflow-y-auto rounded-2xl border border-white/70 bg-white/85 p-1.5 shadow-[0_18px_48px_rgba(35,31,68,0.2)] backdrop-blur-2xl ${portal ? "" : `absolute top-[calc(100%+8px)] min-w-full ${align === "right" ? "right-0" : "left-0"}`}`}
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
            className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-chart-primary)]/20 ${isSelected ? "bg-[var(--br-chart-primary)]/10 font-bold text-[var(--br-chart-primary)]" : "font-medium text-[var(--br-text)] hover:bg-white/80"}`}
          >
            <span className="min-w-0 whitespace-normal">{option.label}</span>
            {isSelected ? <Check className="size-4 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  ) : null;

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

      {portal ? (menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null) : menu}
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ColorPickerPopover } from "@/components/ColorPickerPopover";
import { useSavedBlockBackgroundColors } from "@/components/SavedBlockBackgroundColors";

export type BlockBackgroundColorPreset = { label: string; value: string };

export const BLOCK_BACKGROUND_COLOR_PRESETS: readonly BlockBackgroundColorPreset[] = [
  { label: "No background", value: "" },
  { label: "Soft lavender", value: "#F5F2FE" },
  { label: "Warm cream", value: "#FFF8EE" },
  { label: "Soft blue", value: "#F1F7FF" },
  { label: "Soft mint", value: "#EDF7F1" },
];

export function BlockBackgroundColorPicker({
  label,
  name,
  value,
  presets = BLOCK_BACKGROUND_COLOR_PRESETS,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  presets?: readonly BlockBackgroundColorPreset[];
  onChange: (value: string) => void;
}) {
  const savedColors = useSavedBlockBackgroundColors();
  const swatchStripRef = useRef<HTMLDivElement>(null);
  const [canScrollColors, setCanScrollColors] = useState({ previous: false, next: false });
  const validCurrentColor = /^#[0-9a-fA-F]{6}$/.test(value);
  const alreadySaved = savedColors?.colors.includes(value.toUpperCase()) ?? false;

  useEffect(() => {
    const strip = swatchStripRef.current;
    if (!strip) return;

    const updateOverflow = () => {
      setCanScrollColors({
        previous: strip.scrollLeft > 1,
        next: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      });
    };

    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(strip);
    if (strip.firstElementChild) observer.observe(strip.firstElementChild);
    return () => observer.disconnect();
  }, [presets, savedColors?.colors.length]);

  const scrollColors = (direction: -1 | 1) => {
    const strip = swatchStripRef.current;
    if (!strip) return;
    const swatch = strip.querySelector<HTMLElement>("button");
    const step = swatch ? swatch.offsetWidth + 4 : 24;
    strip.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <fieldset className="min-w-0 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-1.5 pb-1 pt-0.5">
      <legend className="px-1 text-[10px] font-bold text-[var(--br-text-muted)]">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex h-7 min-w-0 items-center gap-1">
        <div className="relative z-10 size-7 shrink-0">
          <ColorPickerPopover label={`Choose custom ${label.toLowerCase()}`} value={value} defaultValue="#FFFFFF" onApply={onChange} />
          {savedColors ? <button type="button" disabled={!validCurrentColor || alreadySaved} aria-label={`Save ${value || "current"} as a favorite color`} title={savedColors.error || (alreadySaved ? "Color already saved" : "Save this color")} onClick={() => void savedColors.save(value)} className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full border border-white bg-[var(--br-brand)] text-white shadow-sm transition hover:scale-110 disabled:cursor-not-allowed disabled:bg-[var(--br-text-muted)] disabled:opacity-40"><Plus size={9} strokeWidth={3} /></button> : null}
        </div>
        <button type="button" aria-label="Show previous color" title="Show previous color" onClick={() => scrollColors(-1)} disabled={!canScrollColors.previous} className={`grid size-6 shrink-0 place-items-center rounded-full text-[var(--br-text-muted)] transition hover:bg-[var(--br-surface-muted)] hover:text-[var(--br-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-brand)] disabled:pointer-events-none ${canScrollColors.previous ? "opacity-100" : "opacity-0"}`}><ChevronLeft size={15} strokeWidth={2.5} /></button>
        <div ref={swatchStripRef} onScroll={() => {
          const strip = swatchStripRef.current;
          if (!strip) return;
          setCanScrollColors({
            previous: strip.scrollLeft > 1,
            next: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
          });
        }} className="flex h-7 min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={`${label} presets and saved colors`}>
          <div className="flex h-6 w-max shrink-0 items-center gap-1 px-1">
            {presets.map((preset) => {
              const selected = value.toLowerCase() === preset.value.toLowerCase();
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-label={preset.label}
                  aria-pressed={selected}
                  title={preset.label}
                  onClick={() => onChange(preset.value)}
                  className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${selected ? "border-[var(--br-brand)] ring-1 ring-[var(--br-brand)] ring-offset-1" : "border-[var(--br-border)] hover:scale-105"}`}
                  style={{ backgroundColor: preset.value || "var(--br-surface)" }}
                >
                  {!preset.value ? <span className="h-px w-4 rotate-[-45deg] bg-[var(--br-text-muted)]" aria-hidden /> : null}
                </button>
              );
            })}
            {savedColors?.colors.length ? <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--br-border)]" /> : null}
            {savedColors?.colors.map((color) => <span key={color} className="relative block size-5 shrink-0">
              <button type="button" aria-label={`Apply saved color ${color}`} aria-pressed={value.toUpperCase() === color} title={color} onClick={() => onChange(color)} className={`size-5 rounded-full border transition hover:scale-105 ${value.toUpperCase() === color ? "border-[var(--br-brand)] ring-1 ring-[var(--br-brand)] ring-offset-1" : "border-[var(--br-border)]"}`} style={{ backgroundColor: color }} />
              <button type="button" aria-label={`Remove saved color ${color}`} title={`Remove ${color}`} onClick={() => void savedColors.remove(color)} className="absolute right-0 top-0 grid size-2.5 place-items-center rounded-full border border-white bg-[var(--br-dark-card)] text-white opacity-90 shadow-sm transition hover:scale-110 hover:bg-[var(--br-danger)]"><X size={7} strokeWidth={3} /></button>
            </span>)}
          </div>
        </div>
        <button type="button" aria-label="Show next color" title="Show next color" onClick={() => scrollColors(1)} disabled={!canScrollColors.next} className={`grid size-6 shrink-0 place-items-center rounded-full text-[var(--br-text-muted)] transition hover:bg-[var(--br-surface-muted)] hover:text-[var(--br-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-brand)] disabled:pointer-events-none ${canScrollColors.next ? "opacity-100" : "opacity-0"}`}><ChevronRight size={15} strokeWidth={2.5} /></button>
      </div>
    </fieldset>
  );
}

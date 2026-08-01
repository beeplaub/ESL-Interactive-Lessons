"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundMuted, setSoundMuted } from "@/lib/gamification/sounds";

export function SoundToggle({ className = "" }: { className?: string }) {
  // Read the stored preference after mount only, so server and client render the same markup first pass.
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isSoundMuted()), []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setSoundMuted(next);
      }}
      aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
      aria-pressed={!muted}
      className={`inline-flex items-center justify-center rounded-full bg-[var(--br-canvas-elevated)] p-2 text-[var(--br-text-muted)] transition hover:bg-surface ${className}`}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}

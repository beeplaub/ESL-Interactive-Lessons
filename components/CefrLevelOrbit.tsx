"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

const LEVELS = [
  { level: "A1", label: "Beginner" },
  { level: "A2", label: "Elementary" },
  { level: "B1", label: "Intermediate" },
  { level: "B2", label: "Upper-Intermediate" },
  { level: "C1", label: "Advanced" },
  { level: "C2", label: "Proficient" },
] as const;

const ORBIT_DURATION_MS = 4000;

export function CefrLevelOrbit() {
  const [levelIndex, setLevelIndex] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const timer = window.setInterval(() => {
      setLevelIndex((index) => (index + 1) % LEVELS.length);
    }, ORBIT_DURATION_MS);

    return () => window.clearInterval(timer);
  }, []);

  const current = LEVELS[levelIndex];

  return (
    <div className="grid size-64 place-items-center" aria-hidden="true">
      <div className="cefr-level-orbit relative grid size-64 place-items-center rounded-full border-4 border-white/10">
        <div className="cefr-level-orbit-core grid size-48 place-items-center rounded-full border-4 border-[var(--br-action)] text-center">
          <span className="cefr-level-orbit-text text-5xl font-bold text-[var(--br-action)]">{current.level}</span>
          <span className="cefr-level-orbit-label text-xs text-[var(--br-border)]">{current.label}</span>
        </div>
        <span className="cefr-level-orbit-marker-track absolute inset-0" aria-hidden="true">
          <span className="cefr-level-orbit-marker-counter absolute -top-5 left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-surface text-[var(--br-text)] shadow-lg">
            <CheckCircle2 className="size-5" />
          </span>
        </span>
      </div>
    </div>
  );
}

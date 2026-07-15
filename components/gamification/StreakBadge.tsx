"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";

export function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <motion.div
      key={streak}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className="inline-flex items-center gap-1 rounded-full bg-[#FFB545]/15 px-3 py-1.5 text-sm font-extrabold text-[#B5730A]"
    >
      <Flame size={15} className="fill-[#FFB545] text-[#FFB545]" /> {streak}
    </motion.div>
  );
}

/** Transient "🔥 5 in a row!" toast, shown near the question card when a streak milestone is hit. */
export function ComboToast({ milestone, onDone }: { milestone: number | null; onDone: () => void }) {
  return (
    <AnimatePresence onExitComplete={onDone}>
      {milestone ? (
        <motion.div
          key={milestone}
          initial={{ y: -12, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -8, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          onAnimationComplete={(definition) => {
            // Auto-dismiss shortly after the entrance animation finishes.
            if (definition === "animate") {
              window.setTimeout(onDone, 1100);
            }
          }}
          className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#FFB545] to-[#FF8C00] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_12px_32px_rgba(255,140,0,.35)]"
        >
          🔥 {milestone} in a row!
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

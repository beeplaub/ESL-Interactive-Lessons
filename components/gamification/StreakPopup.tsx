"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * Anchored streak celebration. Rendered by the parent inside a `relative` wrapper that directly
 * contains the score badge (e.g. "4/8") — this component then positions itself just above and to
 * the left of that badge via `position: absolute`, so it always sits next to the actual score
 * rather than floating anywhere else on screen. Keeping the wrapper this tight is what guarantees
 * it never drifts over unrelated buttons or text: the anchor point IS the score, so "near the
 * score" and "not covering anything else" are the same constraint.
 */
export function StreakPopup({ streak, onDismiss }: { streak: number; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {streak > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          style={{ position: "absolute", bottom: "calc(100% + 10px)", right: 0, zIndex: 30 }}
        >
          {/* Inner layer handles a small continuous drift, independent of the one-time entrance
              above — kept to a tight radius so it stays anchored near the score, never wandering
              far enough to cover neighboring controls. */}
          <motion.div
            animate={{ x: [0, 6, -5, 3, 0], y: [0, -5, 3, -3, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex max-w-[168px] items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-br from-[#FFB545] to-[#FF8C00] py-1.5 pl-3 pr-7 text-white shadow-[0_10px_24px_rgba(255,140,0,.3)]"
          >
            <span className="text-xs font-extrabold leading-none">🔥 {streak} in a row!</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss streak celebration"
              className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-black/15 text-white hover:bg-black/25"
            >
              <X size={12} />
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  labelledBy?: string;
  label?: string;
  fullBleed?: boolean;
};

/**
 * Builder dialogs must escape the workspace's sticky/overflow layout. Rendering
 * at document.body also keeps tall editors inside the visible viewport.
 */
export function BuilderModalLayer({
  children,
  className = "",
  contentClassName = "",
  labelledBy,
  label,
  fullBleed = false,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`lesson-builder-ui fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-[2px] ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
    >
      <div className={`flex min-h-full items-center justify-center ${fullBleed ? "p-0" : "p-3 sm:p-6"} ${contentClassName}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

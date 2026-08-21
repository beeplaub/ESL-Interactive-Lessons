"use client";

import { useEffect } from "react";

/** Keeps popup-style native details menus mutually exclusive across the app. */
export function ExclusivePopupDetails() {
  useEffect(() => {
    const closeOtherPopups = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const summary = target.closest("details[data-exclusive-popup] > summary");
      if (!summary) return;
      const current = summary.parentElement;
      document.querySelectorAll<HTMLDetailsElement>("details[data-exclusive-popup][open]").forEach((popup) => {
        if (popup !== current) popup.open = false;
      });
    };

    document.addEventListener("click", closeOtherPopups);
    return () => document.removeEventListener("click", closeOtherPopups);
  }, []);

  return null;
}

"use client";

import { Printer } from "lucide-react";

export function CertificatePrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] transition hover:bg-[var(--br-chart-primary)] print:hidden">
      <Printer className="size-4" /> Print certificate
    </button>
  );
}

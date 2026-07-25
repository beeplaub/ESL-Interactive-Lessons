"use client";

import { Printer } from "lucide-react";

export function CertificatePrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#6C3BFF] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(108,59,255,.25)] transition hover:bg-[#5930DF] print:hidden">
      <Printer className="size-4" /> Print certificate
    </button>
  );
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

type Faq = { id: string; question: string; answer: string };

export function CourseFaqList({ faqs }: { faqs: Faq[] }) {
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);
  return <div className="grid gap-3">
    {faqs.map((faq) => {
      const isOpen = openId === faq.id;
      return <section key={faq.id} className={`overflow-hidden rounded-2xl border transition-colors ${isOpen ? "border-[var(--br-brand)]/25 bg-[var(--br-brand)]/[0.035] shadow-[var(--br-shadow)]" : "border-[var(--br-border)] bg-surface hover:border-[var(--br-brand)]/20"}`}>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : faq.id)} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5">
          <span className="text-base font-bold leading-6 text-[var(--br-dark-card)]">{faq.question}</span>
          <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[#653cff] transition-colors ${isOpen ? "bg-[#653cff]/10" : "bg-[var(--br-surface-muted)]"}`}><Plus size={17} className={`transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} /></span>
        </button>
        {isOpen ? <div className="px-4 pb-4 text-base leading-7 text-[var(--br-text-muted)] sm:px-5 sm:pb-5"><div className="border-t border-[var(--br-border)] pt-3 whitespace-pre-wrap">{faq.answer}</div></div> : null}
      </section>;
    })}
  </div>;
}

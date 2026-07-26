"use client";

import { useState, useTransition } from "react";
import { Copy, Link2 } from "lucide-react";
import { createGuardianInvitation } from "./guardianActions";

export function GuardianInviteButton({ organizationId, learnerId, learnerName }: { organizationId: string; learnerId: string; learnerName: string }) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return <details className="relative"><summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-black/15 px-2 py-1.5 text-xs font-semibold hover:bg-black/5 [&::-webkit-details-marker]:hidden"><Link2 size={13} /> Guardian</summary><form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; startTransition(async () => { const result = await createGuardianInvitation(organizationId, learnerId, new FormData(form)); if (result.success && result.path) { setLink(`${window.location.origin}${result.path}`); setMessage("Invite link ready. Share it privately with the guardian."); } else setMessage(result.error ?? "Could not create invitation."); }); }} className="absolute right-0 z-30 mt-2 grid w-[min(90vw,340px)] gap-2 rounded-xl border border-black/10 bg-white p-3 shadow-xl"><p className="text-xs font-semibold text-ink">Invite a guardian for {learnerName}</p><input name="email" type="email" required placeholder="guardian@email.com" className="rounded-md border border-black/15 px-2.5 py-2 text-sm" /><button disabled={pending} className="w-fit rounded-md bg-violetglow px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{pending ? "Creating..." : "Create invite link"}</button>{link ? <div className="rounded-lg bg-slate-50 p-2"><p className="break-all text-[11px] text-black/60">{link}</p><button type="button" onClick={() => navigator.clipboard.writeText(link)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violetglow"><Copy size={12} /> Copy link</button></div> : null}{message ? <p className="text-[11px] font-medium text-black/60">{message}</p> : null}</form></details>;
}

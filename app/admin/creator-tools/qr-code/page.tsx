import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AudioQrCodeStudio } from "@/components/AudioQrCodeStudio";
import { requireStaff } from "@/lib/auth";

export default async function AudioQrCodePage() {
  await requireStaff();
  return (
    <main className="min-w-0 space-y-5 pb-12">
      <div className="flex items-center gap-3"><Link href="/admin/creator-tools" className="grid size-9 place-items-center rounded-full border border-[var(--br-border)] bg-surface" title="Back to Creator Tools" aria-label="Back to Creator Tools"><ArrowLeft size={17} /></Link><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--br-brand)]">Creator Tools</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Audio QR Code Maker</h1></div></div>
      <AudioQrCodeStudio />
    </main>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, BadgeCheck, CalendarDays, GraduationCap, ShieldCheck } from "lucide-react";
import { requireUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { CertificatePrintButton } from "@/components/CertificatePrintButton";

export default async function CertificateDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const { data: certificate } = await admin
    .from("course_certificates")
    .select("id,user_id,course_id,certificate_code,issued_at,courses(title,level,topic)")
    .eq("certificate_code", code)
    .maybeSingle();
  if (!certificate || (certificate.user_id !== user.id && !isStaff(profile?.role))) notFound();

  const { data: learner } = await admin
    .from("profiles")
    .select("full_name,first_name,last_name")
    .eq("id", certificate.user_id)
    .maybeSingle();
  const course = Array.isArray(certificate.courses) ? certificate.courses[0] : certificate.courses;
  const learnerName = learner?.full_name?.trim() || [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || "BrenUp learner";

  return (
    <LearnerAppShell active="certificates" showRightSidebar={false}>
      <div className="flex items-center justify-between gap-3 print:hidden"><Link href="/certificates" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--br-text-muted)] hover:text-[var(--br-chart-primary)]"><ArrowLeft className="size-4" /> All certificates</Link><CertificatePrintButton /></div>
      <section className="certificate-sheet overflow-hidden rounded-[28px] border border-[var(--br-warning-soft)] bg-[var(--br-surface-muted)] p-5 shadow-[var(--br-shadow)] sm:p-10">
        <div className="border border-[var(--br-achievement)] p-5 text-center sm:p-10">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-[var(--br-achievement)] to-[var(--br-warning)] text-on-dark shadow-[var(--br-shadow)]"><Award className="size-7" /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-[var(--br-warning)]">BrenUp certificate of completion</p>
          <h1 className="mt-4 font-serif text-3xl font-bold text-[var(--br-text)] sm:text-5xl">Congratulations, {learnerName}</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--br-text-muted)] sm:text-base">This recognizes your successful completion of the BrenUp course</p>
          <h2 className="mt-3 text-xl font-extrabold text-[var(--br-text-muted)] sm:text-3xl">{course?.title ?? "Course"}</h2>
          <div className="mx-auto mt-8 grid max-w-lg gap-3 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--br-warning-soft)] bg-white/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--br-warning)]">Level</p><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[var(--br-text)]"><GraduationCap className="size-4" /> {course?.level ?? "BrenUp"}</p></div>
            <div className="rounded-xl border border-[var(--br-warning-soft)] bg-white/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--br-warning)]">Issued</p><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[var(--br-text)]"><CalendarDays className="size-4" /> {new Date(certificate.issued_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p></div>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-[var(--br-warning)]"><span className="inline-flex items-center gap-1"><BadgeCheck className="size-4" /> Achievement verified by BrenUp</span><span className="inline-flex items-center gap-1"><ShieldCheck className="size-4" /> {certificate.certificate_code}</span></div>
        </div>
      </section>
    </LearnerAppShell>
  );
}

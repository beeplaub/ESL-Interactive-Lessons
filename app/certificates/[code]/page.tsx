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
      <div className="flex items-center justify-between gap-3 print:hidden"><Link href="/certificates" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6E738D] hover:text-[#6C3BFF]"><ArrowLeft className="size-4" /> All certificates</Link><CertificatePrintButton /></div>
      <section className="certificate-sheet overflow-hidden rounded-[28px] border border-[#E8D7A2] bg-[#FFFEF8] p-5 shadow-[0_20px_50px_rgba(75,57,10,.12)] sm:p-10">
        <div className="border border-[#E5C66A] p-5 text-center sm:p-10">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#FFCC54] to-[#D88A08] text-white shadow-[0_10px_24px_rgba(216,138,8,.28)]"><Award className="size-7" /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-[#9A761F]">BrenUp certificate of completion</p>
          <h1 className="mt-4 font-serif text-3xl font-bold text-[#382D0D] sm:text-5xl">Congratulations, {learnerName}</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#665833] sm:text-base">This recognizes your successful completion of the BrenUp course</p>
          <h2 className="mt-3 text-xl font-extrabold text-[#201A09] sm:text-3xl">{course?.title ?? "Course"}</h2>
          <div className="mx-auto mt-8 grid max-w-lg gap-3 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-[#E7D9A8] bg-white/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#927733]">Level</p><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#3D3214]"><GraduationCap className="size-4" /> {course?.level ?? "BrenUp"}</p></div>
            <div className="rounded-xl border border-[#E7D9A8] bg-white/70 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#927733]">Issued</p><p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#3D3214]"><CalendarDays className="size-4" /> {new Date(certificate.issued_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p></div>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-[#7C6527]"><span className="inline-flex items-center gap-1"><BadgeCheck className="size-4" /> Achievement verified by BrenUp</span><span className="inline-flex items-center gap-1"><ShieldCheck className="size-4" /> {certificate.certificate_code}</span></div>
        </div>
      </section>
    </LearnerAppShell>
  );
}

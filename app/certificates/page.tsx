import Link from "next/link";
import { Award, CalendarDays, ChevronRight, GraduationCap, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";

export default async function CertificatesPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data: certificates } = await admin
    .from("course_certificates")
    .select("id,course_id,certificate_code,issued_at,courses(title,level,topic)")
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false });

  return (
    <LearnerAppShell active="certificates">
      <section className="rounded-[24px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[var(--br-dark-card)] to-[var(--br-dark-card)] p-5 text-on-dark shadow-[var(--br-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/60"><Award className="size-4" /> Achievement record</div>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-[28px]">Your certificates</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Every completed BrenUp course earns a permanent record here.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur"><p className="text-2xl font-extrabold">{certificates?.length ?? 0}</p><p className="text-xs font-semibold text-white/65">earned</p></div>
        </div>
      </section>

      <section className="rounded-[20px] border border-[var(--br-surface-strong)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-5">
        <div className="mb-4"><h2 className="text-lg font-extrabold text-[var(--br-dark-card)]">Course credentials</h2><p className="mt-0.5 text-sm text-[var(--br-text-muted)]">Open any certificate for a clean, printable version.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(certificates ?? []).map((certificate) => {
            const course = Array.isArray(certificate.courses) ? certificate.courses[0] : certificate.courses;
            return (
              <Link key={certificate.id} href={`/certificates/${certificate.certificate_code}`} className="group rounded-[18px] border border-[var(--br-surface-strong)] bg-[#FCFCFE] p-4 transition hover:-translate-y-0.5 hover:border-[#D9D4F9] hover:shadow-[var(--br-shadow)]">
                <div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-[14px] bg-gradient-to-br from-[var(--br-achievement)] to-[#FF7A00] text-on-dark shadow-sm"><Award className="size-5" /></span><span className="rounded-md bg-[#E7FBF3] px-2 py-1 text-[10px] font-extrabold text-[#00A875]"><ShieldCheck className="mr-1 inline size-3" /> Issued</span></div>
                <h3 className="mt-4 font-extrabold text-[var(--br-dark-card)]">{course?.title ?? "Completed course"}</h3>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--br-text-muted)]"><span className="inline-flex items-center gap-1"><GraduationCap className="size-3" /> {course?.level ?? "BrenUp"}</span><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" /> {new Date(certificate.issued_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></div>
                <div className="mt-4 flex items-center justify-between text-xs font-bold text-[var(--br-chart-primary)]"><span>View certificate</span><ChevronRight className="size-4 transition group-hover:translate-x-0.5" /></div>
              </Link>
            );
          })}
          {!certificates?.length ? <div className="col-span-full grid min-h-52 place-items-center rounded-[18px] border border-dashed border-[var(--br-border)] bg-[#FAFBFD] p-6 text-center"><div><Award className="mx-auto size-7 text-[#9AA1B8]" /><h3 className="mt-3 font-extrabold text-[var(--br-text)]">Your first certificate is waiting</h3><p className="mt-1 max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">Complete all required items in a course and BrenUp will issue it automatically.</p><Link href="/courses" className="mt-4 inline-flex rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-xs font-extrabold text-on-dark">Browse courses</Link></div></div> : null}
        </div>
      </section>
    </LearnerAppShell>
  );
}

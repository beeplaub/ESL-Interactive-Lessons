import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Our Story | BrenUp",
  description: "The story behind BrenUp and the belief that English learning should become alive.",
};

export default function OurStoryPage() {
  return (
    <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-[24px] border border-[var(--br-border)] bg-surface shadow-[var(--br-shadow)]">
        <header className="bg-[var(--br-dark-card)] px-6 py-10 text-on-dark sm:px-12 sm:py-14">
          <Link href="/" className="text-sm font-extrabold text-white/75 hover:text-white hover:underline">← Back to BrenUp</Link>
          <p className="mt-10 text-xs font-black uppercase tracking-[0.18em] text-white/60">The BrenUp story</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">The builder who wanted English to become alive.</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/70">A story about one question, a growing learning platform, and the belief that a lesson should be more than a page.</p>
        </header>

        <div className="px-6 py-9 sm:px-12 sm:py-12">
          <div className="space-y-8 text-[15px] leading-8 text-[var(--br-text-muted)]">
            <section className="grid gap-5 border-b border-[var(--br-border)] pb-8 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-action)]">Our mission</p>
                <p className="mt-3 text-lg font-bold leading-8 text-[var(--br-text)]">To build internationally recognized, university-standard language courses that develop learners’ practical communication abilities through rigorous outcome-based design, meaningful assessment, and digitally delivered learning experiences.</p>
              </div>
              <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-action)]">Our vision</p>
                <p className="mt-3 text-lg font-bold leading-8 text-[var(--br-text)]">To become Bangladesh’s most trusted one-stop language education partner for universities—providing the complete range of language courses their students need through a reliable, high-quality, and fully digital learning solution.</p>
              </div>
            </section>
            <p className="text-lg font-bold leading-8 text-[var(--br-text)]">A. H. M. Ohidujjaman did not begin with a giant company, a large development team, or a perfect product roadmap.</p>
            <p>He began with a question:</p>
            <blockquote className="border-l-4 border-[var(--br-action)] pl-5 text-2xl font-black leading-9 text-[var(--br-brand)]">Why does English learning so often feel like looking at pages instead of becoming able to speak?</blockquote>
            <p>That question stayed with him.</p>
            <p>He saw lessons trapped inside PDFs, activities separated from real learning, and students moving from one screen to another without feeling that they were progressing toward anything meaningful. Teachers had ideas, experience, and creativity, but turning those ideas into engaging digital learning experiences required too much technical work.</p>
            <p>So he started building.</p>
            <p>At first, the project was modest: upload a lesson, extract its slides, and let learners work through them. But each improvement revealed another possibility. A static slide could become an activity. A quiz could become evidence of learning. A score could become part of a learner’s language profile. A course could become more than a collection of lessons; it could become a journey with outcomes, progress, achievements, and purpose.</p>
            <p>The work was rarely smooth.</p>
            <p>There were broken uploads, missing database columns, stubborn deployment errors, slow pages, confusing redirects, unfinished parsers, and buttons that appeared to work until someone actually clicked them. Sometimes a fix solved one problem and uncovered three more.</p>
            <p>But Ohidujjaman kept returning to the work.</p>
            <p>He learned to think like a teacher, a curriculum designer, a product designer, and an engineer at the same time. He questioned every crowded screen. He asked whether a learner would understand what to do next. He cared about the small things: whether a slide felt too narrow on a phone, whether an activity preserved a learner’s unfinished answer, whether a teacher could edit content without touching JSON, whether a parent could understand a learner’s progress, and whether an outcome actually meant something measurable.</p>
            <p>Gradually, BrenUp began to take shape.</p>
            <p>It became a platform where learners could practise freely, take quizzes, discover their level, build a language profile, earn badges, attend live classes, follow courses, and see evidence of what they could actually do.</p>
            <p>For teachers and creators, it became something more ambitious: a place to build lessons visually, design activities, map questions to outcomes, organize courses, monitor progress, and teach live classrooms from the same learning engine.</p>
            <p>The name BrenUp carries a simple hope:</p>
            <p className="text-2xl font-black text-[var(--br-brand)]">Level up your English.</p>
            <p>Not merely know more rules. Not merely collect scores. Move from understanding to expression. From hesitation to participation. From studying English to using it.</p>
            <p>Ohidujjaman is still building BrenUp. The platform is not finished, and perhaps that is part of its character. It is being shaped through questions, experiments, mistakes, repairs, and a stubborn belief that digital learning can feel more human.</p>
            <p>The ambition is not to build another average LMS.</p>
            <p className="text-lg font-bold leading-8 text-[var(--br-text)]">It is to build a place where English learning feels alive, measurable, encouraging, and genuinely connected to the learner’s voice.</p>
            <div className="border-t border-[var(--br-border)] pt-8">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-action)]">Our philosophy</p>
              <p className="mt-4">Universities should devote their limited academic time and resources to their highest-value responsibilities: teaching students how to think critically, conduct research, create knowledge, and contribute meaningfully to society.</p>
              <p>Language education is essential to those goals, but it does not need to be developed and delivered separately by every university. BrenUp exists to support universities by becoming their specialized language education partner.</p>
              <p>Universities provide their programme outcomes, course outcomes, academic requirements, and grading policies. BrenUp then designs and delivers the required language courses around those standards. Each course is outcome-based, with carefully mapped learning activities, assessments, and evidence of achievement.</p>
              <p>Through this model, universities can outsource the design, delivery, assessment, and reporting of their language courses while retaining academic alignment and institutional standards. Learners receive structured, high-quality language education online, while universities receive reliable evidence of learning and grade sheets prepared according to their own policies.</p>
              <p>BrenUp’s goal is not simply to teach English. It is to provide universities with a complete, trustworthy, digitally enabled language education infrastructure.</p>
            </div>
            <p>And it all began with one person refusing to accept that a lesson had to remain just a page.</p>
          </div>

          <div className="mt-12 flex flex-wrap gap-3 border-t border-[var(--br-border)] pt-7">
            <Link href="/quizzes" className="inline-flex items-center rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] hover:opacity-90">Explore quizzes</Link>
            <Link href="/courses" className="inline-flex items-center rounded-xl border border-[var(--br-border)] bg-surface px-4 py-3 text-sm font-extrabold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]">Explore courses</Link>
          </div>
        </div>
      </article>
    </main>
  );
}

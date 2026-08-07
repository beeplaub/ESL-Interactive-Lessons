import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | BrenUp",
  description: "The terms that apply when you use BrenUp English-learning services.",
};

const sections = [
  ["1. Agreement", <p key="agreement">These Terms of Service govern access to and use of BrenUp, including its website, learning tools, courses, lessons, quizzes, assessments, live classrooms, communication features, and related services. By creating an account or using BrenUp, you agree to these Terms and our <Link className="font-bold text-[var(--br-brand)] underline" href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the service.</p>],
  ["2. Educational service", <p key="education">BrenUp provides educational practice, content creation, assessment, progress tracking, and communication tools. BrenUp is not a school, accredited awarding body, medical provider, immigration adviser, or guarantee of a particular exam, employment, academic, or personal result. Teachers, schools, and creators remain responsible for the accuracy, suitability, and lawful use of content they publish.</p>],
  ["3. Accounts and security", <p key="accounts">You must provide accurate information and keep your account credentials and devices secure. You are responsible for activity performed through your account. Do not share credentials, impersonate another person, bypass access controls, or create accounts to evade a restriction. Tell us promptly if you believe your account is compromised.</p>],
  ["4. Learner, teacher, school, and guardian access", <p key="roles">Access and permissions depend on the role and educational relationship assigned to an account. School and platform administrators may manage members, content, assignments, reports, and classroom features within their authorized scope. Guardians receive only the learner information that their authorized relationship permits. You must not use another person’s role or access to view information outside that scope.</p>],
  ["5. Creator content", <p key="creator">Creators may add text, images, audio, video, links, activities, questions, outcomes, and other materials. You retain ownership of content you own. By submitting content, you grant BrenUp a non-exclusive, worldwide, limited license to host, reproduce, process, display, and deliver it solely to operate, secure, improve, and provide the BrenUp services. You represent that you have the necessary rights and permissions and that your content does not infringe another person’s rights or violate law.</p>],
  ["6. Acceptable use", <ul key="acceptable" className="list-disc space-y-2 pl-5"><li>Do not upload malware, unlawful material, harmful code, or content that violates privacy or intellectual-property rights.</li><li>Do not harass, exploit, threaten, or target learners, teachers, guardians, or staff.</li><li>Do not scrape, reverse engineer, overload, probe, or interfere with BrenUp or its providers.</li><li>Do not abuse email, SMS, push notifications, AI tools, live classrooms, or assessment systems.</li><li>Do not use BrenUp to cheat, impersonate a learner, falsify evidence, or misrepresent results.</li></ul>],
  ["7. AI-assisted features", <p key="ai">Some BrenUp features may generate explanations, translations, activities, suggestions, transcripts, or other outputs using automated systems. Outputs may be incomplete or inaccurate and should be reviewed by a teacher or creator before publication or consequential use. Do not submit confidential, highly sensitive, or unlawful information to an AI feature. AI-generated content does not replace professional judgment.</p>],
  ["8. Third-party services and links", <p key="third">BrenUp may rely on or link to third-party services such as authentication, email, SMS, storage, video, notification, analytics, and AI providers. Those services have their own terms, availability, and privacy practices. BrenUp is not responsible for an external service’s content, outage, policy, or security beyond the obligations that apply to BrenUp.</p>],
  ["9. Communications and live classrooms", <p key="communications">By using relevant features, you agree that BrenUp may send essential account, security, course, assignment, classroom, and service communications. Optional communications may be controlled through available settings. Live-class messages, recordings, voice notes, attendance, and activity evidence may be visible to authorized participants and administrators according to the classroom’s permissions and the Privacy Policy.</p>],
  ["10. Availability and changes", <p key="availability">We work to keep BrenUp reliable, but the service may be changed, interrupted, limited, or unavailable for maintenance, security, provider failure, or circumstances outside our control. We may add, remove, or modify features and may update these Terms. We will publish material changes through the service or another reasonable channel when appropriate.</p>],
  ["11. Suspension and termination", <p key="termination">We may suspend or terminate access when reasonably necessary to protect users, content, the service, or legal obligations, including for abuse, fraud, non-payment where applicable, or serious Terms violations. You may stop using BrenUp and request account deletion. Rights and obligations that by their nature should continue, including content, intellectual property, disclaimers, and limitations, will survive termination.</p>],
  ["12. Disclaimers and limitation", <p key="disclaimer">To the extent permitted by applicable law, BrenUp is provided on an “as available” basis without guarantees that every feature will be uninterrupted, error-free, or suitable for every purpose. To the extent permitted by law, BrenUp will not be liable for indirect, incidental, special, consequential, or lost-profit damages arising from use of the service. Nothing in these Terms limits rights or liability that cannot lawfully be limited.</p>],
  ["13. Contact", <p key="contact">Questions about these Terms may be sent to <a className="font-bold text-[var(--br-brand)] underline" href="mailto:support@brenup.com">support@brenup.com</a>. Please include enough detail for us to understand your request without sending passwords or secret keys.</p>],
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14">
      <article className="mx-auto max-w-4xl rounded-[24px] border border-[var(--br-border)] bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10">
        <Link href="/" className="text-sm font-extrabold text-[var(--br-brand)] hover:underline">← Back to BrenUp</Link>
        <header className="mt-8 border-b border-[var(--br-border)] pb-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">BrenUp legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--br-text)] sm:text-4xl">Terms of Service</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">Last updated: August 7, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--br-text-muted)]">These terms provide the basic rules for using BrenUp safely and fairly across learning, assessment, course creation, school administration, and live classroom experiences.</p>
        </header>
        <div className="mt-8 space-y-8 text-sm leading-7 text-[var(--br-text-muted)]">
          {sections.map(([title, body]) => <section key={title as string}><h2 className="text-lg font-black text-[var(--br-text)]">{title}</h2><div className="mt-3">{body}</div></section>)}
        </div>
        <p className="mt-10 border-t border-[var(--br-border)] pt-6 text-xs leading-6 text-[var(--br-text-muted)]">These Terms are a public service document and should be reviewed by the platform operator and qualified legal counsel before launch in additional jurisdictions.</p>
      </article>
    </main>
  );
}

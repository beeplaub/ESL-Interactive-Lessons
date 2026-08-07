import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | BrenUp",
  description: "How BrenUp collects, uses, protects, and manages personal information.",
};

const sections = [
  {
    title: "1. Who we are",
    body: (
      <>
        <p>BrenUp is an English-learning and assessment platform operated under the BrenUp brand. In this policy, “BrenUp,” “we,” “us,” and “our” refer to the BrenUp service and its operator.</p>
        <p className="mt-3">For privacy questions or requests, contact <a className="font-bold text-[var(--br-brand)] underline" href="mailto:support@brenup.com">support@brenup.com</a>.</p>
      </>
    ),
  },
  {
    title: "2. Information we collect",
    body: (
      <>
        <p><strong>Account information:</strong> When you register, we may collect your name, email address, password credentials managed by our authentication provider, phone number if you choose phone login, profile photo, and account role.</p>
        <p className="mt-3"><strong>Learning information:</strong> We collect quiz answers, scores, lesson progress, course enrollments, assignments, language-profile evidence, level-test results, achievements, notes, and related timestamps so we can provide learning and progress features.</p>
        <p className="mt-3"><strong>Classroom information:</strong> If you join a school, class, assignment, guardian link, or live classroom, we process the information needed to operate that relationship, including attendance, participation, messages, reactions, voice notes, and classroom activity evidence where those features are used.</p>
        <p className="mt-3"><strong>Media and content:</strong> Creators may upload images, audio, video, documents, and narration. We store and deliver this content for the lessons, quizzes, courses, and classrooms where it is used.</p>
        <p className="mt-3"><strong>Technical information:</strong> We may receive IP address, browser and device information, approximate event times, security logs, authentication events, and diagnostic information needed to protect and operate the service.</p>
      </>
    ),
  },
  {
    title: "3. Google sign-in",
    body: <p>If you choose “Continue with Google,” Google shares the basic account information you authorize, such as your name, email address, profile image, and a unique Google account identifier. BrenUp uses this information to create or sign you into your BrenUp account. We do not receive your Google password. We do not sell Google user data or use it for advertising. You can review or revoke third-party access in your Google Account settings.</p>,
  },
  {
    title: "4. How we use information",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Provide authentication, account recovery, courses, lessons, quizzes, level tests, and learner profiles.</li>
        <li>Save progress, answers, outcomes, skills, achievements, certificates, and assessment evidence.</li>
        <li>Operate assignments, calendars, schools, guardians, teachers, and live classrooms.</li>
        <li>Send confirmation, password-reset, invitation, reminder, and service messages that you request or that are necessary to operate your account.</li>
        <li>Protect the service against fraud, spam, abuse, unauthorized access, and technical failures.</li>
        <li>Improve reliability, accessibility, performance, and educational usefulness.</li>
        <li>Provide AI-assisted features only when you or an authorized creator chooses to use them.</li>
      </ul>
    ),
  },
  {
    title: "5. Service providers",
    body: (
      <p>BrenUp uses carefully selected providers to operate the service. Depending on the feature used, these may include Supabase for authentication and database services, Google for OAuth and Firebase Cloud Messaging, Brevo for transactional email, TextBee and an authorized Android gateway for SMS, Cloudflare R2 for media storage and delivery, Vercel for application hosting, and AI providers for explicitly requested AI features. These providers process information only as needed to provide their services, subject to their own terms and privacy policies.</p>
    ),
  },
  {
    title: "6. Notifications and communications",
    body: <p>You may receive account, security, learning, assignment, live-class, and service notifications. Push notifications require browser or device permission. Email and SMS delivery depends on the relevant provider and network. You can manage optional notification preferences where BrenUp provides those controls. Essential security and account messages may still be sent when necessary.</p>,
  },
  {
    title: "7. Cookies and local storage",
    body: <p>BrenUp uses cookies and browser storage for authentication sessions, security, preferences, view settings, notifications, and reliable application behavior. We do not use cookies to sell personal information. Blocking essential cookies may prevent login or learning features from working.</p>,
  },
  {
    title: "8. Sharing and visibility",
    body: <p>We do not sell personal information. Your information may be visible to authorized teachers, school administrators, guardians, or platform administrators only when needed for a legitimate educational or administrative relationship. Guardian access is limited to the learner relationship that was authorized. We may disclose information when required by law, to protect people or the service, or as part of a lawful business transfer.</p>,
  },
  {
    title: "9. Retention and deletion",
    body: <p>We retain account and learning records while your account or an educational relationship requires them, including records needed for progress, reporting, safety, and legal obligations. You may request account deletion or correction by contacting us. Some records may remain in backups, audit logs, or legally required records for a limited period before secure deletion.</p>,
  },
  {
    title: "10. Security",
    body: <p>We use access controls, authenticated sessions, row-level permissions, server-side secrets, encrypted connections, and operational monitoring designed to protect information. No internet service can promise absolute security. Please use a unique password, protect your email account, and notify us promptly about suspicious activity.</p>,
  },
  {
    title: "11. Children",
    body: <p>BrenUp is intended to be used with appropriate permission and supervision when learners are minors. Schools, teachers, and guardians are responsible for obtaining any consent required for their learners and for using classroom features lawfully. If you believe a child’s information was provided without appropriate authorization, contact us so we can investigate.</p>,
  },
  {
    title: "12. Changes to this policy",
    body: <p>We may update this policy as BrenUp grows or as legal and technical requirements change. We will update the date below and, when appropriate, provide notice through the service or by email. Continued use after an update means the updated policy applies to future use.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14">
      <article className="mx-auto max-w-4xl rounded-[24px] border border-[var(--br-border)] bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10">
        <Link href="/" className="text-sm font-extrabold text-[var(--br-brand)] hover:underline">← Back to BrenUp</Link>
        <header className="mt-8 border-b border-[var(--br-border)] pb-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">BrenUp legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--br-text)] sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">Last updated: August 7, 2026</p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--br-text-muted)]">This policy explains what information BrenUp collects, why we use it, how it is shared, and the choices available to learners, teachers, schools, guardians, and administrators.</p>
        </header>
        <div className="mt-8 space-y-8 text-sm leading-7 text-[var(--br-text-muted)]">
          {sections.map((section) => <section key={section.title}><h2 className="text-lg font-black text-[var(--br-text)]">{section.title}</h2><div className="mt-3">{section.body}</div></section>)}
        </div>
        <p className="mt-10 border-t border-[var(--br-border)] pt-6 text-xs leading-6 text-[var(--br-text-muted)]">This page is BrenUp’s public privacy notice. It should be reviewed by the platform operator and qualified legal counsel for the jurisdictions where BrenUp operates.</p>
      </article>
    </main>
  );
}

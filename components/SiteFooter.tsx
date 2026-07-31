import Link from "next/link";
import { Layers } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="bg-[#1B1B3A] py-16 mt-16 text-[#A9A6D6]">
      <div className="mx-auto max-w-[1200px] px-6 flex flex-col md:flex-row justify-between gap-12 mb-12">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 text-white font-extrabold text-xl">
            <span className="grid size-[26px] place-items-center rounded-[8px] bg-[var(--br-brand)]"><Layers className="size-[15px] text-white" /></span>
            BrenUp
          </Link>
          <p className="text-xs leading-6 text-[#A9A6D6] max-w-[260px]">
            AI-powered English learning platform that helps you go from knowing to saying.
          </p>
          <div className="flex gap-3 mt-4">
            <a href="#" aria-label="Twitter" className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-[#A9A6D6] hover:text-white hover:border-white/40 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
            </a>
            <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-[#A9A6D6] hover:text-white hover:border-white/40 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="#" aria-label="YouTube" className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-[#A9A6D6] hover:text-white hover:border-white/40 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
            </a>
          </div>
        </div>
        <div className="flex gap-16 flex-wrap">
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Platform</h4>
            <Link href="/courses" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Courses</Link>
            <Link href="/quizzes" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Quizzes</Link>
            <Link href="/leaderboard" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Leaderboard</Link>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">About</h4>
            <Link href="/" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Our Story</Link>
            <a href="#" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Terms of Service</a>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Support</h4>
            <a href="#" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Help Center</a>
            <a href="mailto:hello@brenup.com" className="text-sm text-[#A9A6D6] hover:text-white transition-colors">Contact Support</a>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-6 border-t border-white/10 pt-8 flex items-center justify-center text-center text-xs">
        <p>© 2026 BrenUp. Level Up Your English.</p>
      </div>
    </footer>
  );
}

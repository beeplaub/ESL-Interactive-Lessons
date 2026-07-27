import Link from "next/link";
import { Globe2, Mail } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#1b1b3a] px-6 py-16 text-center md:text-left">
      <div className="mx-auto grid max-w-[1200px] gap-10 md:grid-cols-2">
        <div>
          <Link href="/" className="text-2xl font-semibold text-[#ffb199]">BrenUp</Link>
          <p className="mx-auto mt-4 max-w-[300px] text-sm leading-6 text-[#b8b8c9] md:mx-0">Empowering global learners to speak with confidence and clarity. From Dusk to Daybreak.</p>
          <div className="mt-5 flex justify-center gap-4 md:justify-start">
            <a href="https://www.brenup.com" aria-label="BrenUp website" className="text-[#b8b8c9] transition hover:text-white"><Globe2 className="size-5" /></a>
            <a href="mailto:hello@brenup.com" aria-label="Email BrenUp" className="text-[#b8b8c9] transition hover:text-white"><Mail className="size-5" /></a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 text-left">
          <div className="flex flex-col gap-3"><h2 className="mb-1 font-bold text-[#f1f1f6]">Platform</h2><Link href="/" className="text-sm text-[#b8b8c9] hover:text-white hover:underline">About Us</Link><a href="#" className="text-sm text-[#b8b8c9] hover:text-white hover:underline">Privacy Policy</a><a href="#" className="text-sm text-[#b8b8c9] hover:text-white hover:underline">Terms of Service</a></div>
          <div className="flex flex-col gap-3"><h2 className="mb-1 font-bold text-[#f1f1f6]">Support</h2><a href="#" className="text-sm text-[#b8b8c9] hover:text-white hover:underline">Help Center</a><a href="mailto:hello@brenup.com" className="text-sm text-[#b8b8c9] hover:text-white hover:underline">Contact</a></div>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-[1200px] border-t border-white/5 pt-5 text-center text-sm text-[#b8b8c9] md:text-left">© {new Date().getFullYear()} BrenUp ESL. From Dusk to Daybreak.</div>
    </footer>
  );
}

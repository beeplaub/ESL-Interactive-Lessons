import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESL Interactive Lessons",
  description: "Upload ESL lesson PDFs and turn them into interactive learner slide decks."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-black/10 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              ESL Studio
            </Link>
            <div className="flex items-center gap-3 text-sm">
              <Link href="/dashboard" className="rounded-md px-3 py-2 hover:bg-black/5">
                Learner
              </Link>
              <Link href="/admin/lessons" className="rounded-md px-3 py-2 hover:bg-black/5">
                Admin
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

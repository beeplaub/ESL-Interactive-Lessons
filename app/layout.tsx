import type { Metadata } from "next";
import { HeaderGate } from "@/components/HeaderGate";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrenUp",
  description: "Interactive English lessons for confident real-world communication."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HeaderGate>
          <SiteHeader />
        </HeaderGate>
        {children}
      </body>
    </html>
  );
}

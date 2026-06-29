"use client";

import { usePathname } from "next/navigation";

export function HeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/level-test/test" || pathname === "/account" || pathname.startsWith("/courses")) return null;
  return children;
}

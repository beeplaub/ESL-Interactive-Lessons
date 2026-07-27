import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminShell({
  name,
  role = "ADMIN",
  children,
}: {
  name: string | null | undefined;
  role?: "ADMIN" | "TEACHER" | "SCHOOL_ADMIN";
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--br-surface-muted)] px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
      {/* Mobile: top bar (original behaviour) */}
      <div className="mb-4 md:hidden">
        <AdminSidebar name={name} role={role} mobileTop />
      </div>

      {/* Desktop: collapsible side rail */}
      <div className="hidden md:flex md:gap-4">
        <AdminSidebar name={name} role={role} />
        <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Mobile children */}
      <div className="md:hidden">
        {children}
      </div>
      </div>
    </div>
  );
}

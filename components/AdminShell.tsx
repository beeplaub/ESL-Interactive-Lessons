import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminShell({
  name,
  children,
}: {
  name: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl gap-4 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6">
      <AdminSidebar name={name} />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
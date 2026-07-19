import { requireStaff } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const role = profile?.role === "ADMIN" ? "ADMIN" : "TEACHER";
  return (
    <AdminShell name={profile?.full_name} role={role}>
      {children}
    </AdminShell>
  );
}

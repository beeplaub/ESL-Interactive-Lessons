import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle, XCircle, Clock, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filterStatus = params.status || "PENDING";
  const admin = createAdminClient();

  let query = admin
    .from("course_orders")
    .select(`
      id,
      amount_bdt,
      payment_method,
      transaction_id,
      sender_number,
      status,
      created_at,
      profiles!course_orders_user_id_fkey (full_name),
      courses!course_orders_course_id_fkey (title)
    `)
    .order("created_at", { ascending: false });

  if (filterStatus !== "ALL") {
    query = query.eq("status", filterStatus);
  }

  const { data: orders } = await query;

  // Fetch count of pending orders for badge
  const { count: pendingCount } = await admin
    .from("course_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  const tabs = [
    { label: "Pending", value: "PENDING", count: pendingCount },
    { label: "Confirmed", value: "CONFIRMED" },
    { label: "Rejected", value: "REJECTED" },
    { label: "All", value: "ALL" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Course Orders</h1>
          <p className="mt-1 text-sm text-black/60">Manage manual payment verifications and enroll learners.</p>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="mb-6 flex gap-2 border-b border-black/10 pb-px">
        {tabs.map((tab) => {
          const isActive = filterStatus === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/orders?status=${tab.value}`}
              className={`pb-3 px-4 text-sm font-semibold border-b-2 transition ${
                isActive
                  ? "border-[#6C3BFF] text-[#6C3BFF]"
                  : "border-transparent text-black/50 hover:text-black hover:border-black/20"
              }`}
            >
              {tab.label}
              {"count" in tab && tab.count && tab.count > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#6C3BFF] px-2 py-0.5 text-[10px] font-bold text-white">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* ORDERS LIST */}
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr>
              <th className="p-3">Learner</th>
              <th className="p-3">Course</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Method</th>
              <th className="p-3">Sender</th>
              <th className="p-3">Transaction ID</th>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => {
              const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
              const course = Array.isArray(order.courses) ? order.courses[0] : order.courses;
              return (
                <tr key={order.id} className="border-t border-black/10">
                  <td className="p-3 font-semibold">{profile?.full_name ?? "Unknown"}</td>
                  <td className="p-3 font-medium">{course?.title ?? "Course Deleted"}</td>
                  <td className="p-3 font-bold">৳{order.amount_bdt}</td>
                  <td className="p-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {order.payment_method}
                    </span>
                  </td>
                  <td className="p-3 font-mono">{order.sender_number ?? "-"}</td>
                  <td className="p-3 font-mono">{order.transaction_id ?? "-"}</td>
                  <td className="p-3 text-black/60">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {order.status === "PENDING" && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full">
                        <Clock size={12} /> Pending
                      </span>
                    )}
                    {order.status === "CONFIRMED" && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                        <CheckCircle size={12} /> Confirmed
                      </span>
                    )}
                    {order.status === "REJECTED" && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">
                        <XCircle size={12} /> Rejected
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 hover:bg-black/5 font-semibold text-xs"
                    >
                      <Eye size={12} /> Review
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!orders?.length ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-black/55">
                  No orders found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

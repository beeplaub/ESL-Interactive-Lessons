import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { OrderStatusSelector } from "./OrderStatusSelector";

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
    .select("id, user_id, course_id, amount_bdt, payment_method, transaction_id, sender_number, status, created_at")
    .order("created_at", { ascending: false });

  if (filterStatus !== "ALL") {
    query = query.eq("status", filterStatus);
  }

  const { data: rawOrders } = await query;

  // Manually fetch associated profiles and courses (avoiding schema FK relationship mismatch)
  const userIds = [...new Set((rawOrders ?? []).map((o) => o.user_id))];
  const courseIds = [...new Set((rawOrders ?? []).map((o) => o.course_id))];

  const [{ data: profiles }, { data: courses }] = await Promise.all([
    userIds.length > 0
      ? admin.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    courseIds.length > 0
      ? admin.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const courseMap = new Map((courses ?? []).map((c) => [c.id, c]));

  const orders = (rawOrders ?? []).map((order) => ({
    ...order,
    profile: profileMap.get(order.user_id),
    course: courseMap.get(order.course_id),
  }));

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
                  ? "border-[var(--br-chart-primary)] text-[var(--br-chart-primary)]"
                  : "border-transparent text-black/50 hover:text-black hover:border-black/20"
              }`}
            >
              {tab.label}
              {"count" in tab && tab.count && tab.count > 0 ? (
                <span className="ml-1.5 rounded-full bg-[var(--br-chart-primary)] px-2 py-0.5 text-[10px] font-bold text-white">
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
              return (
                <tr key={order.id} className="border-t border-black/10">
                  <td className="p-3 font-semibold">{order.profile?.full_name ?? "Unknown"}</td>
                  <td className="p-3 font-medium">{order.course?.title ?? "Course Deleted"}</td>
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
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-black/15 px-2.5 py-1.5 hover:bg-black/5 font-semibold text-xs"
                      >
                        <Eye size={12} /> Review
                      </Link>
                      <OrderStatusSelector orderId={order.id} currentStatus={order.status} />
                    </div>
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

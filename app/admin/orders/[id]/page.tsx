import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, CheckCircle, XCircle, User, BookOpen, CreditCard, Shield } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmCourseOrder, rejectCourseOrder } from "@/app/admin/courses/actions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("course_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) notFound();

  const [{ data: profile }, { data: course }] = await Promise.all([
    admin.from("profiles").select("full_name, avatar_url").eq("id", order.user_id).single(),
    admin.from("courses").select("title, price_bdt, level, topic").eq("id", order.course_id).single(),
  ]);

  // Generate a signed URL for the payment receipt screenshot if it exists
  let receiptUrl: string | null = null;
  if (order.receipt_path) {
    const { data: signedData } = await admin.storage
      .from("payment-receipts")
      .createSignedUrl(order.receipt_path, 3600);
    receiptUrl = signedData?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-sm text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)] mb-5">
        <ArrowLeft size={16} /> Back to orders
      </Link>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        {/* MAIN PANEL */}
        <div className="space-y-6">
          {/* HEADER */}
          <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Order Review</span>
            <h1 className="mt-1 text-2xl font-bold text-[var(--br-text-muted)]">Order #{order.id.slice(0, 8)}</h1>
            <p className="mt-2 text-sm text-[var(--br-text-muted)]">Submitted on {new Date(order.created_at).toLocaleString()}</p>
            
            <div className="mt-4 flex items-center gap-2">
              {order.status === "PENDING" && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                  <Clock size={14} /> Pending Verification
                </span>
              )}
              {order.status === "CONFIRMED" && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  <CheckCircle size={14} /> Confirmed & Enrolled
                </span>
              )}
              {order.status === "REJECTED" && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full">
                  <XCircle size={14} /> Rejected
                </span>
              )}
            </div>
          </div>

          {/* TRANSACTION & PAYMENT PROOF */}
          <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--br-text-muted)]"><CreditCard size={18} /> Transaction Details</h2>
            
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-xl bg-surface-muted p-4">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Payment Method</span>
                <span className="text-base font-extrabold mt-1 block text-slate-800">{order.payment_method}</span>
              </div>
              <div className="rounded-xl bg-surface-muted p-4">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Amount Paid</span>
                <span className="text-base font-extrabold mt-1 block text-emerald-600">৳{order.amount_bdt}</span>
              </div>
              <div className="rounded-xl bg-surface-muted p-4">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Sender Account/Number</span>
                <span className="text-base font-mono font-extrabold mt-1 block text-slate-800">{order.sender_number ?? "-"}</span>
              </div>
              <div className="rounded-xl bg-surface-muted p-4">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Transaction ID</span>
                <span className="text-base font-mono font-extrabold mt-1 block text-slate-800">{order.transaction_id ?? "-"}</span>
              </div>
            </div>

            {order.note && (
              <div className="rounded-xl border border-slate-100 bg-surface-muted/50 p-4">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">User Note</span>
                <p className="mt-1.5 text-sm text-slate-700 font-medium leading-relaxed">"{order.note}"</p>
              </div>
            )}

            {/* RECEIPT ATTACHMENT */}
            {receiptUrl ? (
              <div className="space-y-2">
                <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Uploaded Receipt Screenshot</span>
                <div className="overflow-hidden rounded-xl border border-[var(--br-border)] bg-surface-muted p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receiptUrl}
                    alt="Receipt attachment screenshot"
                    className="max-h-[450px] w-auto object-contain mx-auto rounded-lg shadow-sm"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs font-bold text-slate-400 uppercase py-2">No screenshot attachment provided.</p>
            )}
          </div>

          {/* ADMIN VERIFICATION & MANUAL STATUS UPDATE ACTIONS */}
          <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm space-y-5">
            <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--br-text-muted)]"><Shield size={18} /> Manage Order Status</h2>
            <p className="text-sm text-[var(--br-text-muted)]">
              Current status: <strong className="text-[var(--br-text-muted)]">{order.status}</strong>. You can manually change the order status below at any time.
            </p>

            <div className="space-y-4">
              {order.status !== "CONFIRMED" && (
                <form action={confirmCourseOrder.bind(null, order.id)}>
                  <button className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-extrabold text-on-dark transition">
                    Mark as Confirmed & Enroll User
                  </button>
                </form>
              )}

              {order.status !== "PENDING" && (
                <form
                  action={async () => {
                    "use server";
                    const { updateOrderStatusDirectly } = await import("@/app/admin/courses/actions");
                    await updateOrderStatusDirectly(order.id, "PENDING");
                  }}
                >
                  <button className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-sm font-extrabold text-on-dark transition">
                    Reset to Pending
                  </button>
                </form>
              )}

              {order.status !== "REJECTED" && (
                <form
                  action={async (fd) => {
                    "use server";
                    const note = String(fd.get("adminNote") || "").trim();
                    await rejectCourseOrder(order.id, note);
                  }}
                  className="w-full border-t border-dashed border-[var(--br-border)] pt-4 space-y-3"
                >
                  <label className="text-sm font-bold block text-slate-700">
                    Rejection Reason
                    <input
                      name="adminNote"
                      type="text"
                      placeholder="e.g. Transaction ID mismatch / Amount insufficient (optional)"
                      className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] px-3 py-2 text-sm text-slate-800 font-normal"
                    />
                  </label>
                  <button className="rounded-xl bg-red-600 hover:bg-red-700 px-5 py-2.5 text-sm font-extrabold text-on-dark transition">
                    Mark as Rejected
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* REJECTED OR CONFIRMED METADATA */}
          {order.status !== "PENDING" && (
            <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm text-sm space-y-3">
              <span className="text-xs text-[var(--br-text-muted)] font-bold uppercase block">Verification Log</span>
              {order.status === "REJECTED" && order.admin_note && (
                <div className="rounded-xl bg-red-50/50 border border-red-100 p-4">
                  <span className="text-xs font-bold text-red-800 uppercase">Reason for Rejection</span>
                  <p className="mt-1.5 font-medium text-red-950">"{order.admin_note}"</p>
                </div>
              )}
              <div className="text-[var(--br-text-muted)] text-xs font-semibold">
                Processed at {new Date(order.confirmed_at || order.updated_at).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR PANEL */}
        <aside className="space-y-4">
          {/* USER INFO */}
          <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold text-[var(--br-text-muted)] uppercase tracking-wider flex items-center gap-1.5"><User size={14} /> Learner</h3>
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <div className="grid size-10 place-items-center rounded-full bg-[var(--br-chart-primary)]/10 text-[var(--br-chart-primary)] font-bold">
                  {profile?.full_name?.charAt(0) ?? "U"}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-extrabold truncate text-[var(--br-text-muted)] leading-tight">{profile?.full_name ?? "Unknown"}</p>
                <p className="text-xs text-[var(--br-text-muted)] font-semibold mt-1">ID: {order.user_id.slice(0, 8)}...</p>
              </div>
            </div>
          </div>

          {/* COURSE INFO */}
          <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold text-[var(--br-text-muted)] uppercase tracking-wider flex items-center gap-1.5"><BookOpen size={14} /> Course</h3>
            <div>
              <p className="font-extrabold text-[var(--br-text-muted)] leading-snug">{course?.title ?? "Course Deleted"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                {course?.level && <span className="bg-surface-strong px-2 py-0.5 rounded text-slate-600">{course.level}</span>}
                {course?.topic && <span className="bg-surface-strong px-2 py-0.5 rounded text-slate-600">{course.topic}</span>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

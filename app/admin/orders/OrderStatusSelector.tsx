"use client";

import { useTransition } from "react";
import { updateOrderStatusDirectly } from "@/app/admin/courses/actions";

export function OrderStatusSelector({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentStatus}
      disabled={isPending}
      onChange={(e) => {
        const newStatus = e.target.value as "PENDING" | "CONFIRMED" | "REJECTED";
        startTransition(async () => {
          await updateOrderStatusDirectly(orderId, newStatus);
        });
      }}
      className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs font-semibold shadow-sm focus:outline-none disabled:opacity-50"
    >
      <option value="PENDING">Set Pending</option>
      <option value="CONFIRMED">Set Confirmed</option>
      <option value="REJECTED">Set Rejected</option>
    </select>
  );
}

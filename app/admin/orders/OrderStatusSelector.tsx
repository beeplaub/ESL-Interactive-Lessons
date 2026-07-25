"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatusDirectly } from "@/app/admin/courses/actions";

export function OrderStatusSelector({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => {
          const newStatus = e.target.value as "PENDING" | "CONFIRMED" | "REJECTED";
          const previousStatus = status;
          setStatus(newStatus);
          setError(null);
          startTransition(async () => {
            const result = await updateOrderStatusDirectly(orderId, newStatus);
            if (!result.success) {
              setStatus(previousStatus);
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs font-semibold shadow-sm focus:outline-none disabled:opacity-50"
      >
        <option value="PENDING">Set Pending</option>
        <option value="CONFIRMED">Set Confirmed</option>
        <option value="REJECTED">Set Rejected</option>
      </select>
      {error ? <p className="mt-1 max-w-40 text-[10px] font-semibold leading-tight text-red-600">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { permanentlyRemoveCancelledCourseLearnerAction } from "@/app/admin/courses/actions";

export function RemoveCancelledCourseLearnerButton({
  courseId,
  userId,
  learnerName,
}: {
  courseId: string;
  userId: string;
  learnerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const confirmed = window.confirm(
            `Permanently remove ${learnerName} from this course? This deletes the canceled enrollment, course progress and assessment records, certificates, payment submissions and receipts, and course notifications. The learner account and their data in other courses will remain. This cannot be undone.`,
          );
          if (!confirmed) return;

          setBusy(true);
          setMessage(null);
          setIsError(false);
          const result = await permanentlyRemoveCancelledCourseLearnerAction(courseId, userId);
          setBusy(false);
          if (result.success && result.warning) window.alert(result.warning);
          setMessage(result.success ? result.warning ?? "Removed permanently." : result.error);
          setIsError(!result.success);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
      >
        <Trash2 size={13} /> {busy ? "Removing…" : "Remove permanently"}
      </button>
      {message ? <p role={isError ? "alert" : "status"} className={`max-w-64 text-xs ${isError ? "text-red-700" : "text-[var(--br-text-muted)]"}`}>{message}</p> : null}
    </div>
  );
}

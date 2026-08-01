"use client";

import { useState, useTransition } from "react";
import { uploadAvatar } from "@/app/profile/actions";

export function AvatarUploader({ initialUrl, initials }: { initialUrl: string | null; initials: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function upload(file: File) {
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("avatar", file);
      const result = await uploadAvatar(formData);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.url) setUrl(result.url);
    });
  }

  return (
    <div className="flex flex-col items-center">
      <div className="grid size-28 place-items-center overflow-hidden rounded-[32px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-brand)] text-3xl font-black text-on-dark shadow-[var(--br-shadow)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile avatar" className="h-28 w-28 object-cover" />
        ) : initials}
      </div>
      <label className="mt-4 inline-flex cursor-pointer rounded-[14px] border border-[var(--br-border)] bg-surface px-4 py-2.5 text-sm font-extrabold text-[var(--br-chart-primary)] shadow-[var(--br-shadow)] hover:bg-[var(--br-canvas-elevated)]">
        {isPending ? "Uploading..." : "Upload photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
      </label>
      {message ? <p className="mt-3 rounded-[12px] bg-[var(--br-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--br-danger)]">{message}</p> : null}
    </div>
  );
}

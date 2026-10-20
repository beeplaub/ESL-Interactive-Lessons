"use client";

import { useState, useTransition } from "react";
import { completeAvatarUpload, createAvatarUploadTarget } from "@/app/profile/actions";

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AvatarUploader({ initialUrl, initials }: { initialUrl: string | null; initials: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function upload(file: File) {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!ACCEPTED_TYPES.has(file.type)) {
          setMessage("Choose a JPG, PNG, or WebP image.");
          return;
        }
        if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
          setMessage("Choose an image smaller than 8 MB.");
          return;
        }

        const target = await createAvatarUploadTarget(file.type);
        if (target.error || !target.uploadUrl || !target.path) {
          setMessage(target.error ?? "Could not start the upload. Please try again.");
          return;
        }
        const response = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": target.contentType },
          body: file,
        });
        if (!response.ok) {
          setMessage("The image could not be uploaded. Please try again.");
          return;
        }

        const result = await completeAvatarUpload(target.path);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        if (result.url) setUrl(result.url);
      } catch {
        setMessage("The image could not be uploaded. Please try again.");
      }
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
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) upload(file);
          }}
        />
      </label>
      {message ? <p className="mt-3 rounded-[12px] bg-[var(--br-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--br-danger)]">{message}</p> : null}
    </div>
  );
}

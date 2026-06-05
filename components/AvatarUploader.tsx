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
    <div>
      <div className="grid size-24 place-items-center overflow-hidden rounded-full bg-skywash text-2xl font-semibold text-ink">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile avatar" className="h-24 w-24 object-cover" />
        ) : initials}
      </div>
      <label className="mt-4 inline-flex cursor-pointer rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5">
        {isPending ? "Saving..." : "Upload photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
      </label>
      {message ? <p className="mt-2 text-sm text-coral">{message}</p> : null}
    </div>
  );
}

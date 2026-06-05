"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateAvatarUrl } from "@/app/profile/actions";

export function AvatarUploader({ userId, initialUrl, initials }: { userId: string; initialUrl: string | null; initials: string }) {
  const supabase = createClient();
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function upload(file: File) {
    setMessage(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setMessage(error.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setUrl(data.publicUrl);
    startTransition(async () => {
      await updateAvatarUrl(data.publicUrl);
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

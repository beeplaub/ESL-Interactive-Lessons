"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Music, Pencil, Trash2, Video } from "lucide-react";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteMediaAsset, updateMediaAssetDetails } from "@/app/admin/media/actions";

export type MediaAssetRow = {
  id: string;
  owner_id: string;
  type: "IMAGE" | "AUDIO" | "VIDEO";
  source: "UPLOAD" | "LINK";
  url: string;
  title: string | null;
  alt_text: string | null;
  caption: string | null;
  tags: string[] | null;
  file_name: string | null;
  lesson_title: string | null;
  use_count: number;
  last_used_at: string;
  created_at: string;
};

function youtubeThumbnail(url: string) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

function displayName(asset: MediaAssetRow) {
  return asset.title || asset.caption || asset.file_name || asset.url.split("/").pop() || "Untitled";
}

export function MediaAssetCard({ asset, canManage }: { asset: MediaAssetRow; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = displayName(asset);
  const ytThumb = asset.type === "VIDEO" ? youtubeThumbnail(asset.url) : null;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, the URL is still visible/selectable
    }
  }

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm transition hover:shadow-md">
      {/* Preview */}
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-surface-muted">
        {asset.type === "IMAGE" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.alt_text ?? name} className="h-full w-full object-cover" loading="lazy" />
        ) : asset.type === "VIDEO" ? (
          ytThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ytThumb} alt={name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Video size={30} className="text-[var(--br-text-muted)]" />
          )
        ) : (
          <Music size={30} className="text-[var(--br-text-muted)]" />
        )}

        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-dark">
          {asset.type}
        </span>
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide
            ${asset.source === "UPLOAD" ? "bg-moss/90 text-on-dark" : "bg-amber-500/90 text-on-dark"}`}
        >
          {asset.source === "UPLOAD" ? "Uploaded" : "Link"}
        </span>
      </div>

      {asset.type === "AUDIO" && !/youtube\.com|youtu\.be/i.test(asset.url) ? (
        <audio controls src={asset.url} className="w-full border-b border-[var(--br-border)]" />
      ) : null}

      {/* Meta + actions */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        {editing ? (
          <form
            action={async (formData) => {
              await updateMediaAssetDetails(asset.id, formData);
              setEditing(false);
            }}
            className="space-y-1.5"
          >
            <input
              name="title"
              defaultValue={asset.title ?? ""}
              placeholder="Title"
              className="w-full rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs"
            />
            {asset.type === "IMAGE" ? (
              <input
                name="altText"
                defaultValue={asset.alt_text ?? ""}
                placeholder="Alt text"
                className="w-full rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs"
              />
            ) : null}
            <input
              name="caption"
              defaultValue={asset.caption ?? ""}
              placeholder="Caption / label"
              className="w-full rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs"
            />
            <input
              name="tags"
              defaultValue={(asset.tags ?? []).join(", ")}
              placeholder="Tags, comma separated"
              className="w-full rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs"
            />
            <div className="flex gap-2">
              <button className="rounded-md bg-violetglow px-2.5 py-1.5 text-xs font-semibold text-on-dark">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-semibold">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="truncate text-sm font-semibold" title={name}>{name}</p>
            <p className="truncate text-[11px] text-[var(--br-text-muted)]">
              {asset.lesson_title ? `Used in ${asset.lesson_title}` : "Not yet used in a lesson"} · {asset.use_count}× reused
            </p>
            {asset.tags && asset.tags.length ? (
              <div className="flex flex-wrap gap-1">
                {asset.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-medium text-[var(--br-text-muted)]">{tag}</span>
                ))}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-auto flex items-center gap-1 border-t border-[var(--br-border)] pt-2">
          <button
            type="button"
            onClick={copyUrl}
            title="Copy URL"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--br-border)] px-2 py-1.5 text-xs font-semibold text-[var(--br-text-muted)] hover:bg-black/5"
          >
            {copied ? <Check size={13} className="text-moss" /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy URL"}
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            title="Open"
            className="inline-flex items-center justify-center rounded-md border border-[var(--br-border)] p-1.5 text-[var(--br-text-muted)] hover:bg-black/5"
          >
            <ExternalLink size={14} />
          </a>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                title="Edit details"
                className="inline-flex items-center justify-center rounded-md border border-[var(--br-border)] p-1.5 text-[var(--br-text-muted)] hover:bg-black/5"
              >
                <Pencil size={14} />
              </button>
              <DeleteButton
                title="Move to trash?"
                message={`"${name}" will move to Media Trash. It won't remove the file from any lesson it's already used in.`}
                isSoftDelete
                action={() => deleteMediaAsset(asset.id)}
                className="inline-flex items-center justify-center rounded-md border border-coral/25 p-1.5 text-coral hover:bg-coral/5"
              >
                <Trash2 size={14} />
              </DeleteButton>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

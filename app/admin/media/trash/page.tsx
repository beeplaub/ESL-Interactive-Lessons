import Link from "next/link";
import { ArrowLeft, Images, RotateCcw, Trash2 } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { permanentlyDeleteMediaAsset, restoreMediaAsset } from "@/app/admin/media/actions";

export default async function AdminMediaTrashPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const isAdmin = isPlatformAdmin(profile?.role);

  let query = admin.from("media_assets").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (!isAdmin) query = query.eq("owner_id", user.id);
  const { data: assets } = await query;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/media" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]">
            <ArrowLeft size={15} /> Back to Media Library
          </Link>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Media trash</h1>
          <p className="mt-2 text-sm text-[var(--br-text-muted)]">
            Deleted media lands here first. Restoring brings it back into your library — nothing in any
            lesson that already uses this file or link is ever touched by a soft delete.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="hidden grid-cols-[1.6fr_0.7fr_0.9fr_1.2fr] gap-3 border-b border-[var(--br-border)] bg-surface-muted p-3 text-xs font-semibold uppercase tracking-wide text-[var(--br-text-muted)] md:grid">
          <span>Media</span><span>Type</span><span>Deleted at</span><span>Actions</span>
        </div>
        <div className="divide-y divide-black/10">
          {(assets ?? []).map((asset) => (
            <div key={asset.id} className="grid gap-3 p-4 md:grid-cols-[1.6fr_0.7fr_0.9fr_1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold">{asset.title || asset.caption || asset.file_name || asset.url}</p>
                <p className="mt-1 truncate text-xs text-[var(--br-text-muted)]">{asset.url}</p>
              </div>
              <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold text-[var(--br-text-muted)]">{asset.type}</span>
              <span className="text-sm text-[var(--br-text-muted)]">
                {asset.deleted_at ? new Date(asset.deleted_at).toLocaleString() : "—"}
              </span>
              <div className="flex flex-wrap gap-2">
                <form action={restoreMediaAsset.bind(null, asset.id)}>
                  <button className="inline-flex items-center gap-1 rounded-md bg-moss px-2.5 py-1.5 text-xs font-semibold text-on-dark">
                    <RotateCcw size={13} /> Restore
                  </button>
                </form>
                <form action={permanentlyDeleteMediaAsset.bind(null, asset.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={`Permanently delete "${asset.title || asset.file_name || asset.url}"? This cannot be undone.`}
                    className="inline-flex items-center gap-1 rounded-md border border-coral/30 px-2.5 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5"
                  >
                    <Trash2 size={13} /> Delete forever
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {(assets?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--br-text-muted)]">
              <Images className="mx-auto mb-3 text-[var(--br-text-muted)]" size={32} />
              Trash is empty. Deleted media will show up here.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

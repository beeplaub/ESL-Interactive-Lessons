import Link from "next/link";
import { Images, Trash2 } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MediaLibraryUploader } from "@/components/MediaLibraryUploader";
import { MediaAssetCard, type MediaAssetRow } from "@/components/MediaAssetCard";
import { MEDIA_PAGE_SIZE, mediaSearchExpression, parseMediaPage } from "@/lib/storage/mediaPages";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminMediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const params = await searchParams;
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const isAdmin = isPlatformAdmin(profile?.role);
  const typeFilter = value("type");
  const sourceFilter = value("source");
  const creatorFilter = value("creator");
  const search = value("q").trim();
  const sort = value("sort") || "newest";
  const page = parseMediaPage(value("page"));

  let query = admin.from("media_assets").select("*", { count: "exact" }).is("deleted_at", null);
  if (!isAdmin) query = query.eq("owner_id", user.id);
  if (sourceFilter) query = query.eq("source", sourceFilter);
  if (isAdmin && creatorFilter) query = query.eq("owner_id", creatorFilter);
  if (search) query = query.or(mediaSearchExpression(search));
  if (typeFilter) query = query.eq("type", typeFilter);
  const order = sort === "oldest"
    ? { column: "created_at", ascending: true }
    : sort === "most_used"
      ? { column: "use_count", ascending: false }
      : sort === "name"
        ? { column: "title", ascending: true }
        : { column: "created_at", ascending: false };
  const from = (page - 1) * MEDIA_PAGE_SIZE;
  const { data: rows, count } = await query.order(order.column, { ascending: order.ascending }).order("id", { ascending: true }).range(from, from + MEDIA_PAGE_SIZE - 1);
  const assets = (rows ?? []) as MediaAssetRow[];
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / MEDIA_PAGE_SIZE));
  const boundedPage = Math.min(page, pageCount);

  // Only ADMIN needs a creator filter/attribution — a TEACHER's query is
  // already scoped to their own media, so there's nothing else to show.
  let creatorNames = new Map<string, string>();
  if (isAdmin) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name, first_name, last_name").in("role", ["ADMIN", "TEACHER", "SCHOOL_ADMIN"]);
    creatorNames = new Map((profiles ?? []).map((p) => [
      p.id,
      p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Creator",
    ]));
  }

  const countQuery = (type?: string) => {
    let scoped = admin.from("media_assets").select("id", { count: "exact", head: true }).is("deleted_at", null);
    if (!isAdmin) scoped = scoped.eq("owner_id", user.id);
    if (type) scoped = scoped.eq("type", type);
    return scoped;
  };
  const [allCountResult, imageCountResult, audioCountResult, videoCountResult] = await Promise.all([
    countQuery(), countQuery("IMAGE"), countQuery("AUDIO"), countQuery("VIDEO"),
  ]);
  const counts = {
    all: allCountResult.count ?? 0,
    IMAGE: imageCountResult.count ?? 0,
    AUDIO: audioCountResult.count ?? 0,
    VIDEO: videoCountResult.count ?? 0,
  };

  function withParam(name: string, val: string) {
    const next = new URLSearchParams();
    for (const key of ["type", "source", "creator", "q", "sort"]) {
      const v = key === name ? val : value(key);
      if (v) next.set(key, v);
    }
    const qs = next.toString();
    return qs ? `/admin/media?${qs}` : "/admin/media";
  }
  function pageHref(nextPage: number) {
    const next = new URLSearchParams();
    for (const key of ["type", "source", "creator", "q", "sort"]) if (value(key)) next.set(key, value(key));
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return qs ? `/admin/media?${qs}` : "/admin/media";
  }

  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <Images size={25} className="text-violetglow" /> Media Library
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--br-text-muted)]">
              Every image, audio clip, and video link you&apos;ve used across your lessons — in one place, ready to reuse.
              {!isAdmin ? " Only media you've uploaded or linked is shown here." : " As an admin, you're seeing every creator's media."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/media/trash"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--br-border)] px-3 py-2 text-sm font-semibold text-[var(--br-text-muted)] hover:bg-black/5"
            >
              <Trash2 size={15} /> Trash
            </Link>
            <MediaLibraryUploader />
          </div>
        </div>
      </section>

      {/* Type pills */}
      <section className="flex flex-wrap items-center gap-2">
        {([
          ["", `All (${counts.all})`],
          ["IMAGE", `Images (${counts.IMAGE})`],
          ["AUDIO", `Audio (${counts.AUDIO})`],
          ["VIDEO", `Video (${counts.VIDEO})`],
        ] as const).map(([key, label]) => (
          <Link
            key={key || "all"}
            href={withParam("type", key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition
              ${typeFilter === key ? "bg-violetglow text-on-dark" : "bg-surface text-[var(--br-text-muted)] border border-[var(--br-border)] hover:bg-black/5"}`}
          >
            {label}
          </Link>
        ))}
      </section>

      {/* Filters */}
      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--br-border)] bg-surface p-3 shadow-sm">
        <input type="hidden" name="type" value={typeFilter} />
        <input
          name="q"
          defaultValue={value("q")}
          placeholder="Search by name, caption, tag, or lesson…"
          className="min-w-[220px] flex-1 rounded-md border border-[var(--br-border)] px-3 py-2 text-sm"
        />
        <select name="source" defaultValue={sourceFilter} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm">
          <option value="">All sources</option>
          <option value="UPLOAD">Uploaded files</option>
          <option value="LINK">External links</option>
        </select>
        {isAdmin ? (
          <select name="creator" defaultValue={creatorFilter} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm">
            <option value="">All creators</option>
            {Array.from(creatorNames.entries()).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        ) : null}
        <select name="sort" defaultValue={sort} className="rounded-md border border-[var(--br-border)] px-3 py-2 text-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most_used">Most reused</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <button className="rounded-md border border-[var(--br-border)] px-4 py-2 text-sm font-semibold hover:bg-black/5">Apply</button>
      </form>

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {assets.map((asset) => (
          <div key={asset.id} className="min-w-0">
            {isAdmin ? (
              <p className="mb-1 truncate text-[11px] font-medium text-[var(--br-text-muted)]">{creatorNames.get(asset.owner_id) ?? "Creator"}</p>
            ) : null}
            <MediaAssetCard asset={asset} canManage />
          </div>
        ))}
        {!assets.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-[var(--br-border)] p-10 text-center text-sm text-[var(--br-text-muted)]">
            No media matches these filters yet. Upload a file or add a link to get started.
          </div>
        ) : null}
      </section>
      {pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Media pages">
          <Link aria-disabled={boundedPage <= 1} className={`rounded-md border border-[var(--br-border)] px-3 py-2 ${boundedPage <= 1 ? "pointer-events-none opacity-40" : ""}`} href={pageHref(Math.max(1, boundedPage - 1))}>Previous</Link>
          <span className="text-[var(--br-text-muted)]">Page {boundedPage} of {pageCount} · {count ?? 0} items</span>
          <Link aria-disabled={boundedPage >= pageCount} className={`rounded-md border border-[var(--br-border)] px-3 py-2 ${boundedPage >= pageCount ? "pointer-events-none opacity-40" : ""}`} href={pageHref(Math.min(pageCount, boundedPage + 1))}>Next</Link>
        </nav>
      ) : null}
    </main>
  );
}

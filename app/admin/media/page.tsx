import Link from "next/link";
import { Images, Trash2 } from "lucide-react";
import { requireStaff, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MediaLibraryUploader } from "@/components/MediaLibraryUploader";
import { MediaAssetCard, type MediaAssetRow } from "@/components/MediaAssetCard";

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

  let query = admin.from("media_assets").select("*").is("deleted_at", null);
  if (!isAdmin) query = query.eq("owner_id", user.id);
  const { data: rows } = await query.order("created_at", { ascending: false });
  const assets = (rows ?? []) as MediaAssetRow[];

  // Only ADMIN needs a creator filter/attribution — a TEACHER's query is
  // already scoped to their own media, so there's nothing else to show.
  let creatorNames = new Map<string, string>();
  if (isAdmin) {
    const ownerIds = Array.from(new Set(assets.map((asset) => asset.owner_id)));
    const { data: profiles } = ownerIds.length
      ? await admin.from("profiles").select("id, full_name, first_name, last_name").in("id", ownerIds)
      : { data: [] };
    creatorNames = new Map((profiles ?? []).map((p) => [
      p.id,
      p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Creator",
    ]));
  }

  const typeFilter = value("type");
  const sourceFilter = value("source");
  const creatorFilter = value("creator");
  const search = value("q").toLowerCase();
  const sort = value("sort") || "newest";

  const filtered = assets.filter((asset) => {
    if (typeFilter && asset.type !== typeFilter) return false;
    if (sourceFilter && asset.source !== sourceFilter) return false;
    if (isAdmin && creatorFilter && asset.owner_id !== creatorFilter) return false;
    if (search) {
      const haystack = [asset.title, asset.caption, asset.alt_text, asset.file_name, asset.lesson_title, asset.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === "most_used") return b.use_count - a.use_count;
    if (sort === "name") return (a.title || a.file_name || "").localeCompare(b.title || b.file_name || "");
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const counts = {
    all: assets.length,
    IMAGE: assets.filter((a) => a.type === "IMAGE").length,
    AUDIO: assets.filter((a) => a.type === "AUDIO").length,
    VIDEO: assets.filter((a) => a.type === "VIDEO").length,
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

  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <Images size={25} className="text-violetglow" /> Media Library
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-black/55">
              Every image, audio clip, and video link you&apos;ve used across your lessons — in one place, ready to reuse.
              {!isAdmin ? " Only media you've uploaded or linked is shown here." : " As an admin, you're seeing every creator's media."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/media/trash"
              className="inline-flex items-center gap-2 rounded-full border border-black/15 px-3 py-2 text-sm font-semibold text-black/60 hover:bg-black/5"
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
              ${typeFilter === key ? "bg-violetglow text-white" : "bg-white text-black/60 border border-black/10 hover:bg-black/5"}`}
          >
            {label}
          </Link>
        ))}
      </section>

      {/* Filters */}
      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        <input type="hidden" name="type" value={typeFilter} />
        <input
          name="q"
          defaultValue={value("q")}
          placeholder="Search by name, caption, tag, or lesson…"
          className="min-w-[220px] flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
        />
        <select name="source" defaultValue={sourceFilter} className="rounded-md border border-black/15 px-3 py-2 text-sm">
          <option value="">All sources</option>
          <option value="UPLOAD">Uploaded files</option>
          <option value="LINK">External links</option>
        </select>
        {isAdmin ? (
          <select name="creator" defaultValue={creatorFilter} className="rounded-md border border-black/15 px-3 py-2 text-sm">
            <option value="">All creators</option>
            {Array.from(creatorNames.entries()).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        ) : null}
        <select name="sort" defaultValue={sort} className="rounded-md border border-black/15 px-3 py-2 text-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most_used">Most reused</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <button className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold hover:bg-black/5">Apply</button>
      </form>

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((asset) => (
          <div key={asset.id} className="min-w-0">
            {isAdmin ? (
              <p className="mb-1 truncate text-[11px] font-medium text-black/40">{creatorNames.get(asset.owner_id) ?? "Creator"}</p>
            ) : null}
            <MediaAssetCard asset={asset} canManage />
          </div>
        ))}
        {!sorted.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-black/15 p-10 text-center text-sm text-black/50">
            No media matches these filters yet. Upload a file or add a link to get started.
          </div>
        ) : null}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  CopyPlus,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  List,
  ListOrdered,
  Loader2,
  MessageCircleMore,
  MessageSquareQuote,
  PanelRight,
  Plus,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  X,
} from "lucide-react";
import {
  changeBlogPostStatus,
  saveBlogPost,
  scheduleBlogPost,
} from "@/app/admin/blog/actions";
import {
  BlogRevisionPanel,
  type BlogRevisionSummary,
} from "@/components/BlogRevisionPanel";
import {
  BlogPatternLibrary,
  type BlogPattern,
} from "@/components/BlogPatternLibrary";
import {
  BlogReviewPanel,
  type BlogEditorialComment,
} from "@/components/BlogReviewPanel";
import { parseBlogRichText } from "@/lib/blog-rich-text";

type BlogRole =
  | "PLATFORM_ADMIN"
  | "EDITOR"
  | "AUTHOR"
  | "CONTRIBUTOR"
  | "REVIEWER";
type BlockType =
  | "paragraph"
  | "heading"
  | "quote"
  | "callout"
  | "list"
  | "image"
  | "cta"
  | "lesson";
const LESSON_BLOCK_TYPES = [
  "BULLETS", "IMAGE_TEXT", "AUDIO", "VIDEO",
  "VOCABULARY", "GRAMMAR", "READING", "DIALOGUE", "FLASHCARD", "TABLE", "COMMON_MISTAKE", "DIVIDER",
] as const;
type LessonBlockType = typeof LESSON_BLOCK_TYPES[number];
type Block = {
  id: string;
  type: BlockType;
  text?: string;
  level?: 2 | 3 | 4;
  attribution?: string;
  tone?: "IDEA" | "TIP" | "NOTE";
  style?: "BULLET" | "NUMBERED";
  items?: string[];
  src?: string;
  alt?: string;
  caption?: string;
  label?: string;
  href?: string;
  description?: string;
  lessonType?: LessonBlockType;
  lessonContent?: Record<string, unknown>;
};

export type EditableBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: { type?: string; content?: Block[] } | null;
  status:
    | "DRAFT"
    | "IN_REVIEW"
    | "CHANGES_REQUESTED"
    | "APPROVED"
    | "SCHEDULED"
    | "PUBLISHED"
    | "ARCHIVED"
    | "TRASH";
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  primaryCategoryId: string | null;
  categoryIds: string[];
  tagIds: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  socialTitle: string | null;
  socialDescription: string | null;
  canonicalUrl: string | null;
  coverAssetId: string | null;
  primaryKeyword: string | null;
  allowIndex: boolean;
  isFeatured: boolean;
  tocEnabled: boolean;
  tocTitle: string;
  tocIncludeH3: boolean;
  tocIncludeH4: boolean;
  tocIncludeH5: boolean;
  tocIncludeH6: boolean;
  updatedAt: string;
  scheduledAt: string | null;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankBlock = (type: BlockType): Block =>
  type === "heading"
    ? { id: uid(), type, level: 2, text: "Section heading" }
    : type === "quote"
      ? {
          id: uid(),
          type,
          text: "A useful idea worth remembering.",
          attribution: "",
        }
      : type === "callout"
        ? {
            id: uid(),
            type,
            tone: "TIP",
            text: "Add a practical tip for the reader.",
          }
        : type === "list"
          ? {
              id: uid(),
              type,
              style: "BULLET",
              items: ["First point", "Second point"],
            }
          : type === "image"
            ? { id: uid(), type, src: "", alt: "", caption: "" }
            : type === "cta"
              ? {
                  id: uid(),
                  type,
                  label: "Explore BrenUp",
                  href: "/courses",
                  description: "Give readers one clear next step.",
                }
              : type === "lesson"
                ? { id: uid(), type, lessonType: "BULLETS", lessonContent: { title: "Key points", items: ["First point", "Second point"] } }
                : { id: uid(), type, text: "Start writing here…" };
const normalizeBlocks = (value: EditableBlogPost["content"]) =>
  Array.isArray(value?.content)
    ? value.content.map((block) => ({
        ...blankBlock(block.type || "paragraph"),
        ...block,
        id: block.id || uid(),
      }))
    : [blankBlock("paragraph")];

function blockName(type: BlockType) {
  return {
    paragraph: "Text",
    heading: "Heading",
    quote: "Quote",
    callout: "Callout",
    list: "List",
    image: "Image",
    cta: "Call to action",
    lesson: "Lesson content block",
  }[type];
}

function iconFor(type: BlockType) {
  return {
    paragraph: Type,
    heading: BookOpenText,
    quote: MessageSquareQuote,
    callout: Lightbulb,
    list: List,
    image: ImageIcon,
    cta: Sparkles,
    lesson: Layers3,
  }[type];
}

export function BlogPostEditor({
  post,
  role,
  categories,
  tags,
  media,
  revisions,
  patterns,
  comments,
}: {
  post: EditableBlogPost;
  role: BlogRole;
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  media: Array<{ id: string; title: string | null; url: string; type: string }>;
  revisions: BlogRevisionSummary[];
  patterns: BlogPattern[];
  comments: BlogEditorialComment[];
}) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt || "");
  const [blocks, setBlocks] = useState<Block[]>(() =>
    normalizeBlocks(post.content),
  );
  const [visibility, setVisibility] = useState(post.visibility);
  const [categoryIds, setCategoryIds] = useState<string[]>(post.categoryIds);
  const [tagIds, setTagIds] = useState<string[]>(post.tagIds);
  const [primaryCategoryId, setPrimaryCategoryId] = useState(
    post.primaryCategoryId || "",
  );
  const [seoTitle, setSeoTitle] = useState(post.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(
    post.seoDescription || "",
  );
  const [socialTitle, setSocialTitle] = useState(post.socialTitle || "");
  const [socialDescription, setSocialDescription] = useState(
    post.socialDescription || "",
  );
  const [canonicalUrl, setCanonicalUrl] = useState(post.canonicalUrl || "");
  const [coverAssetId, setCoverAssetId] = useState(post.coverAssetId || "");
  const [primaryKeyword, setPrimaryKeyword] = useState(
    post.primaryKeyword || "",
  );
  const [allowIndex, setAllowIndex] = useState(post.allowIndex);
  const [isFeatured, setIsFeatured] = useState(post.isFeatured);
  const [tocEnabled, setTocEnabled] = useState(post.tocEnabled);
  const [tocTitle, setTocTitle] = useState(post.tocTitle);
  const [tocIncludeH3, setTocIncludeH3] = useState(post.tocIncludeH3);
  const [tocIncludeH4, setTocIncludeH4] = useState(post.tocIncludeH4);
  const [tocIncludeH5, setTocIncludeH5] = useState(post.tocIncludeH5);
  const [tocIncludeH6, setTocIncludeH6] = useState(post.tocIncludeH6);
  const [scheduledAt, setScheduledAt] = useState(
    post.scheduledAt ? post.scheduledAt.slice(0, 16) : "",
  );
  const [panel, setPanel] = useState<"SEO" | "TAXONOMY" | "TOC">("TAXONOMY");
  const [workspace, setWorkspace] = useState<
    "REVIEW" | "REVISION" | "PREVIEW" | null
  >(null);
  const [mediaAssets, setMediaAssets] = useState(media);
  const [notice, setNotice] = useState(
    "Saved changes are kept in this browser until you save.",
  );
  const [isPending, startTransition] = useTransition();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(true);
  const canEdit = role !== "REVIEWER";
  const canPublish = role === "PLATFORM_ADMIN" || role === "EDITOR";
  const data = useMemo(
    () => ({
      title,
      slug,
      excerpt,
      content: { type: "doc" as const, content: blocks },
      visibility,
      categoryIds,
      tagIds,
      primaryCategoryId: primaryCategoryId || null,
      seoTitle,
      seoDescription,
      socialTitle,
      socialDescription,
      canonicalUrl,
      coverAssetId: coverAssetId || null,
      primaryKeyword,
      allowIndex,
      isFeatured,
      tocEnabled,
      tocTitle,
      tocIncludeH3,
      tocIncludeH4,
      tocIncludeH5,
      tocIncludeH6,
    }),
    [
      title,
      slug,
      excerpt,
      blocks,
      visibility,
      categoryIds,
      tagIds,
      primaryCategoryId,
      seoTitle,
      seoDescription,
      socialTitle,
      socialDescription,
      canonicalUrl,
      coverAssetId,
      primaryKeyword,
      allowIndex,
      isFeatured,
      tocEnabled,
      tocTitle,
      tocIncludeH3,
      tocIncludeH4,
      tocIncludeH5,
      tocIncludeH6,
    ],
  );

  useEffect(() => {
    if (!canEdit) return;
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setNotice("Editing… autosave is queued.");
    autosaveTimer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await saveBlogPost(post.id, data, "AUTOSAVED");
        setNotice(
          result.success
            ? "Saved quietly just now."
            : result.error || "Autosave could not finish.",
        );
      });
    }, 2600);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [data, canEdit, post.id]);

  function saveNow() {
    startTransition(async () => {
      const result = await saveBlogPost(post.id, data);
      setNotice(
        result.success
          ? "Saved. Your revision is safely stored."
          : result.error || "Could not save this revision.",
      );
    });
  }
  function workflow(status: EditableBlogPost["status"], message: string) {
    startTransition(async () => {
      const result = await saveBlogPost(post.id, data);
      if (!result.success) {
        setNotice(
          result.error || "Save the draft before changing its workflow.",
        );
        return;
      }
      const next = await changeBlogPostStatus(post.id, status);
      setNotice(
        next.success ? message : next.error || "Could not change the workflow.",
      );
    });
  }
  function schedule() {
    startTransition(async () => {
      const result = await saveBlogPost(post.id, data);
      if (!result.success) {
        setNotice(result.error || "Save the draft before scheduling.");
        return;
      }
      const next = await scheduleBlogPost(post.id, scheduledAt);
      setNotice(
        next.success
          ? "Scheduled. BrenUp will publish this article at the chosen time."
          : next.error || "Could not schedule the post.",
      );
    });
  }
  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    );
  }
  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function toggleValue(
    value: string,
    setValue: (next: string[]) => void,
    current: string[],
  ) {
    setValue(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  return (
    <main className="min-w-0 space-y-4">
      <header className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--br-border)] bg-surface/95 p-3 shadow-sm backdrop-blur sm:px-4">
        <Link
          href="/admin/blog"
          className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"
          aria-label="Back to BrenUp Journal"
        >
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">
            {title || "Untitled post"}
          </p>
          <p className="truncate text-xs text-[var(--br-text-muted)]">
            /blog/{post.slug} · {post.status.replaceAll("_", " ")}
          </p>
        </div>
        <span className="hidden text-xs font-medium text-[var(--br-text-muted)] sm:inline">
          {isPending ? "Saving…" : notice}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={saveNow}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink hover:bg-[var(--br-surface-muted)]"
          >
            <Save size={15} /> Save
          </button>
        ) : null}
        {canEdit && ["DRAFT", "CHANGES_REQUESTED"].includes(post.status) ? (
          <button
            type="button"
            onClick={() => workflow("IN_REVIEW", "Sent to review.")}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--br-brand)]/25 bg-[var(--br-brand-soft)] px-3 py-2 text-sm font-bold text-[var(--br-brand)]"
          >
            <Send size={15} /> Review
          </button>
        ) : null}
        {canPublish && post.status !== "PUBLISHED" ? (
          <button
            type="button"
            onClick={() =>
              workflow(
                "PUBLISHED",
                "Published. It is now live in BrenUp Journal.",
              )
            }
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--br-brand)] px-3 py-2 text-sm font-bold text-on-dark"
          >
            <CheckCircle2 size={15} /> Publish
          </button>
        ) : null}
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--br-border)] bg-surface p-2.5 shadow-sm">
        <BlogPatternLibrary
          patterns={patterns}
          currentBlocks={blocks}
          canSave={canEdit}
          canShare={["PLATFORM_ADMIN", "EDITOR"].includes(role)}
          onInsert={(incoming) =>
            setBlocks((current) => [...current, ...(incoming as Block[])])
          }
        />
        <button
          type="button"
          onClick={() => setWorkspace("REVIEW")}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink hover:bg-[var(--br-surface-muted)]"
        >
          <MessageCircleMore size={15} className="text-[var(--br-brand)]" />{" "}
          Review{comments.length ? ` (${comments.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setWorkspace("REVISION")}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink hover:bg-[var(--br-surface-muted)]"
        >
          <History size={15} className="text-[var(--br-brand)]" /> Revision
          {revisions.length ? ` (${revisions.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setWorkspace("PREVIEW")}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-brand)] px-3 py-2 text-sm font-bold text-on-dark hover:opacity-90"
        >
          <Eye size={15} /> Preview
        </button>
      </div>
      <section className="grid gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <SlugField value={slug} disabled={!canEdit} onChange={setSlug} />
        <FeatureImageField
          media={mediaAssets}
          value={coverAssetId}
          disabled={!canEdit}
          onChange={setCoverAssetId}
          onUploaded={(asset) =>
            setMediaAssets((current) => [asset, ...current])
          }
        />
      </section>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
          <div className="border-b border-[var(--br-border)] px-4 py-5 sm:px-7">
            <textarea
              value={title}
              disabled={!canEdit}
              onChange={(event) =>
                setTitle(event.target.value.replace(/\n/g, " "))
              }
              placeholder="Article title"
              rows={2}
              className="w-full resize-none bg-transparent text-2xl font-bold leading-tight tracking-tight text-ink outline-none placeholder:text-[var(--br-text-muted)] sm:text-3xl"
            />
            <textarea
              value={excerpt}
              disabled={!canEdit}
              onChange={(event) => setExcerpt(event.target.value)}
              placeholder="Write a concise, helpful summary for readers and search results."
              rows={2}
              className="mt-3 w-full resize-none bg-transparent text-sm leading-6 text-[var(--br-text-muted)] outline-none placeholder:text-[var(--br-text-muted)]"
            />
          </div>
          <div className="space-y-3 p-4 xl:h-[calc(100vh-168px)] xl:overflow-y-auto xl:overscroll-contain sm:p-7">
            <p className="rounded-xl bg-[var(--br-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--br-text-muted)]">
              Writing blocks keep pasted paragraphs and normal bullet or
              numbered lists. Press Enter for a new paragraph; paste lists
              directly from Google Docs or Word.
            </p>
            {blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                media={mediaAssets}
                editable={canEdit}
                onChange={(patch) => updateBlock(block.id, patch)}
                onRemove={() =>
                  setBlocks((current) =>
                    current.filter((item) => item.id !== block.id),
                  )
                }
                onMove={moveBlock}
              />
            ))}
            {canEdit ? (
              <AddBlock
                onAdd={(type) =>
                  setBlocks((current) => [...current, blankBlock(type)])
                }
              />
            ) : null}
          </div>
        </section>
        <aside className="min-w-0 space-y-3 xl:sticky xl:top-[76px] xl:self-start">
          <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-3 shadow-sm">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--br-surface-muted)] p-1">
              {(["TAXONOMY", "TOC", "SEO"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPanel(item)}
                  className={`rounded-lg px-2 py-2 text-[11px] font-bold ${panel === item ? "bg-surface text-[var(--br-brand)] shadow-sm" : "text-[var(--br-text-muted)]"}`}
                >
                  {item === "TAXONOMY"
                    ? "Topics"
                    : item === "TOC"
                      ? "TOC"
                      : "SEO"}
                </button>
              ))}
            </div>
            {panel === "TAXONOMY" ? (
              <div className="space-y-4 p-2 pt-4">
                <div>
                  <p className="text-sm font-bold text-ink">Categories</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">
                    Choose the places where readers should discover this
                    article.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categories.map((item) => (
                      <label
                        key={item.id}
                        className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-xs font-semibold ${categoryIds.includes(item.id) ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] text-[var(--br-brand)]" : "border-[var(--br-border)] text-[var(--br-text-muted)]"}`}
                      >
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={categoryIds.includes(item.id)}
                          disabled={!canEdit}
                          onChange={() =>
                            toggleValue(item.id, setCategoryIds, categoryIds)
                          }
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </div>
                {categoryIds.length ? (
                  <label className="block text-xs font-semibold text-[var(--br-text-muted)]">
                    Primary category
                    <select
                      value={primaryCategoryId}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setPrimaryCategoryId(event.target.value)
                      }
                      className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <option value="">Choose primary category</option>
                      {categories
                        .filter((item) => categoryIds.includes(item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <div>
                  <p className="text-sm font-bold text-ink">Tags</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((item) => (
                      <label
                        key={item.id}
                        className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-xs font-semibold ${tagIds.includes(item.id) ? "border-[var(--br-action)] bg-[var(--br-action)]/10 text-[var(--br-action)]" : "border-[var(--br-border)] text-[var(--br-text-muted)]"}`}
                      >
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={tagIds.includes(item.id)}
                          disabled={!canEdit}
                          onChange={() =>
                            toggleValue(item.id, setTagIds, tagIds)
                          }
                        />
                        {item.name}
                      </label>
                    ))}
                    {!tags.length ? (
                      <p className="text-xs text-[var(--br-text-muted)]">
                        No tags yet. Editors will manage them from the Journal
                        settings.
                      </p>
                    ) : null}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--br-surface-muted)] px-3 py-2 text-xs font-semibold text-ink">
                  <span>Featured article</span>
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    disabled={!canEdit}
                    onChange={(event) => setIsFeatured(event.target.checked)}
                  />
                </label>
              </div>
            ) : null}
            {panel === "SEO" ? (
              <div className="space-y-3 p-2 pt-4">
                <p className="text-sm font-bold text-ink">Search and sharing</p>
                <Field
                  label="SEO title"
                  value={seoTitle}
                  onChange={setSeoTitle}
                  disabled={!canEdit}
                  hint={`${seoTitle.length}/60`}
                />
                <Field
                  label="SEO description"
                  value={seoDescription}
                  onChange={setSeoDescription}
                  multiline
                  disabled={!canEdit}
                  hint={`${seoDescription.length}/160`}
                />
                <Field
                  label="Primary keyword"
                  value={primaryKeyword}
                  onChange={setPrimaryKeyword}
                  disabled={!canEdit}
                />
                <Field
                  label="Canonical URL"
                  value={canonicalUrl}
                  onChange={setCanonicalUrl}
                  disabled={!canEdit}
                />
                <Field
                  label="Social title"
                  value={socialTitle}
                  onChange={setSocialTitle}
                  disabled={!canEdit}
                />
                <Field
                  label="Social description"
                  value={socialDescription}
                  onChange={setSocialDescription}
                  multiline
                  disabled={!canEdit}
                />
                <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--br-surface-muted)] px-3 py-2 text-xs font-semibold text-ink">
                  <span>Allow search indexing</span>
                  <input
                    type="checkbox"
                    checked={allowIndex}
                    disabled={!canEdit}
                    onChange={(event) => setAllowIndex(event.target.checked)}
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--br-text-muted)]">
                  Visibility
                  <select
                    value={visibility}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setVisibility(event.target.value as typeof visibility)
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="UNLISTED">Unlisted</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </label>
              </div>
            ) : null}
            {panel === "TOC" ? (
              <div className="space-y-4 p-2 pt-4">
                <div>
                  <p className="text-sm font-bold text-ink">
                    Table of contents
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">
                    BrenUp builds this automatically from your article headings.
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--br-surface-muted)] px-3 py-3 text-sm font-bold text-ink">
                  <span>Show on article</span>
                  <input
                    type="checkbox"
                    checked={tocEnabled}
                    disabled={!canEdit}
                    onChange={(event) => setTocEnabled(event.target.checked)}
                  />
                </label>
                <Field
                  label="TOC title"
                  value={tocTitle}
                  onChange={setTocTitle}
                  disabled={!canEdit}
                />
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[var(--br-text-muted)]">
                    Include heading levels
                  </p>
                  {[
                    ["H3", tocIncludeH3, setTocIncludeH3],
                    ["H4", tocIncludeH4, setTocIncludeH4],
                    ["H5", tocIncludeH5, setTocIncludeH5],
                    ["H6", tocIncludeH6, setTocIncludeH6],
                  ].map(([label, checked, setChecked]) => (
                    <label
                      key={label as string}
                      className="flex items-center justify-between rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm font-semibold text-ink"
                    >
                      <span>{label as string}</span>
                      <input
                        type="checkbox"
                        checked={checked as boolean}
                        disabled={!canEdit}
                        onChange={(event) =>
                          (setChecked as (value: boolean) => void)(
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] leading-5 text-[var(--br-text-muted)]">
                  H2 headings are always included. The TOC stays hidden when the
                  article has no eligible headings.
                </p>
              </div>
            ) : null}
          </section>
          {canPublish ? (
            <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
              <p className="text-sm font-bold text-ink">Schedule publication</p>
              <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">
                The secure BrenUp scheduler publishes it at this time.
              </p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-3 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2 text-sm text-ink"
              />
              <button
                type="button"
                disabled={isPending || !scheduledAt}
                onClick={schedule}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--br-brand)]/25 bg-[var(--br-brand-soft)] px-3 py-2 text-sm font-bold text-[var(--br-brand)]"
              >
                <Clock3 size={15} /> Schedule article
              </button>
            </section>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => workflow("TRASH", "Post moved to trash.")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-surface px-3 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={15} /> Move to trash
            </button>
          ) : null}
        </aside>
      </div>
      <WorkspaceModal
        open={workspace}
        onClose={() => setWorkspace(null)}
        title={
          workspace === "REVIEW"
            ? "Review"
            : workspace === "REVISION"
              ? "Revision"
              : "Article preview"
        }
      >
        {workspace === "REVIEW" ? (
          <BlogReviewPanel
            postId={post.id}
            comments={comments}
            canComment={[
              "PLATFORM_ADMIN",
              "EDITOR",
              "REVIEWER",
              "AUTHOR",
              "CONTRIBUTOR",
            ].includes(role)}
          />
        ) : null}
        {workspace === "REVISION" ? (
          <BlogRevisionPanel
            postId={post.id}
            revisions={revisions}
            canRestore={canEdit}
          />
        ) : null}
        {workspace === "PREVIEW" ? (
          <EditorPreview
            title={title}
            excerpt={excerpt}
            blocks={blocks}
            coverUrl={
              mediaAssets.find((asset) => asset.id === coverAssetId)?.url ||
              null
            }
            full
          />
        ) : null}
      </WorkspaceModal>
    </main>
  );
}

function SlugField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-[var(--br-text-muted)]">
      <span>Article slug</span>
      <div className="mt-1.5 flex overflow-hidden rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)]">
        <span className="shrink-0 border-r border-[var(--br-border)] px-3 py-2 text-sm font-medium text-[var(--br-text-muted)]">
          /blog/
        </span>
        <input
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value.replace(/^\/+|\s+/g, "-").toLowerCase())
          }
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-ink outline-none focus:bg-surface"
        />
      </div>
      <p className="mt-1 text-[11px] font-normal leading-4 text-[var(--br-text-muted)]">
        BrenUp keeps the domain and Journal path fixed. Change only this final
        part.
      </p>
    </label>
  );
}

function FeatureImageField({
  media,
  value,
  onChange,
  disabled,
  onUploaded,
}: {
  media: Array<{ id: string; title: string | null; url: string; type: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onUploaded: (asset: {
    id: string;
    title: string | null;
    url: string;
    type: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const images = media.filter((item) => item.type === "IMAGE");
  const visibleImages = images.filter((item) =>
    (item.title || "").toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = images.find((item) => item.id === value);
  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "image");
      body.append("lessonId", "library");
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.id)
        throw new Error(result.error || "Upload could not finish.");
      const asset = {
        id: result.id as string,
        title: file.name,
        url: result.url as string,
        type: "IMAGE",
      };
      onUploaded(asset);
      onChange(asset.id);
      setOpen(false);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Upload could not finish.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-[var(--br-text-muted)]">
        Feature image
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-1.5 flex w-full items-center gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-2 text-left hover:bg-surface disabled:opacity-60"
      >
        {selected ? (
          <img
            src={selected.url}
            alt=""
            className="h-12 w-20 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-12 w-20 place-items-center rounded-lg border border-dashed border-[var(--br-border)] text-[var(--br-text-muted)]">
            <ImageIcon size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">
            {selected?.title || "Choose a feature image"}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--br-text-muted)]">
            Upload or select from Media Library
          </span>
        </span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose feature image"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-2xl">
            <div className="flex items-start gap-3 border-b border-[var(--br-border)] p-5">
              <div className="grid size-10 place-items-center rounded-xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]">
                <ImageIcon size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-ink">Feature image</h2>
                <p className="mt-1 text-sm text-[var(--br-text-muted)]">
                  Choose from your library or upload a fresh image without
                  leaving this article.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-[var(--br-text-muted)]"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-brand)] px-3 py-2 text-sm font-bold text-on-dark"
                >
                  <UploadCloud size={16} />{" "}
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm font-bold text-[var(--br-text-muted)]"
                >
                  No feature image
                </button>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your image library"
                className="mb-4 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2.5 text-sm text-ink outline-none focus:border-[var(--br-brand)]"
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibleImages.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => {
                      onChange(image.id);
                      setOpen(false);
                    }}
                    className={`overflow-hidden rounded-xl border text-left ${value === image.id ? "border-[var(--br-brand)] ring-2 ring-[var(--br-brand)]/20" : "border-[var(--br-border)]"}`}
                  >
                    <img
                      src={image.url}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <span className="block truncate p-2 text-xs font-semibold text-ink">
                      {image.title || "Untitled image"}
                    </span>
                  </button>
                ))}
                {!visibleImages.length ? (
                  <p className="col-span-full rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">
                    {images.length
                      ? "No images match that search."
                      : "Your image library is empty. Upload an image to use it here."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  if (label === "Canonical URL") return null;
  return (
    <label className="block text-xs font-semibold text-[var(--br-text-muted)]">
      <span className="flex justify-between gap-2">
        {label}
        {hint ? <span className="font-normal">{hint}</span> : null}
      </span>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal text-ink outline-none focus:border-[var(--br-brand)]"
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-normal text-ink outline-none focus:border-[var(--br-brand)]"
        />
      )}
    </label>
  );
}

function AddBlock({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const options: Array<[BlockType, string]> = [
    ["paragraph", "Text"],
    ["heading", "Heading"],
    ["list", "List"],
    ["quote", "Quote"],
    ["callout", "Callout"],
    ["image", "Image"],
    ["cta", "Call to action"],
    ["lesson", "Lesson content block"],
  ];
  function toggle() {
    if (!open && buttonRef.current) {
      setOpenUp(
        window.innerHeight - buttonRef.current.getBoundingClientRect().bottom <
          310,
      );
    }
    setOpen((value) => !value);
  }
  return (
    <div className="relative pt-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--br-brand)]/40 bg-[var(--br-brand-soft)] px-3 py-2 text-sm font-bold text-[var(--br-brand)]"
      >
        <Plus size={16} /> Add content block
      </button>
      {open ? (
        <div
          className={`absolute left-0 z-20 grid w-[min(520px,calc(100vw-64px))] grid-cols-2 gap-2 rounded-2xl border border-[var(--br-border)] bg-surface p-2 shadow-xl sm:grid-cols-3 ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {options.map(([type, label]) => {
            const Icon = iconFor(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-[var(--br-surface-muted)]"
              >
                <Icon size={16} className="text-[var(--br-brand)]" />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function BlockEditor({
  block,
  index,
  total,
  media,
  editable,
  onChange,
  onRemove,
  onMove,
}: {
  block: Block;
  index: number;
  total: number;
  media: Array<{ id: string; title: string | null; url: string; type: string }>;
  editable: boolean;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const Icon = iconFor(block.type);
  const [open, setOpen] = useState(true);
  return (
    <article className="group rounded-2xl border border-[var(--br-border)] bg-surface">
      <div className="flex items-center gap-2 border-b border-[var(--br-border)] px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-[var(--br-brand-soft)] text-[var(--br-brand)]">
            <Icon size={14} />
          </span>
          <span className="text-xs font-bold text-ink">
            {blockName(block.type)}
          </span>
          <ChevronDown
            size={14}
            className={`ml-auto text-[var(--br-text-muted)] transition ${open ? "rotate-180" : ""}`}
          />
        </button>
        {editable ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              className="grid size-7 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] disabled:opacity-30"
              aria-label="Move block up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={() => onMove(index, 1)}
              className="grid size-7 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] disabled:opacity-30"
              aria-label="Move block down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="grid size-7 place-items-center rounded-lg text-[var(--br-text-muted)] hover:bg-rose-50 hover:text-rose-600"
              aria-label="Remove block"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="p-3">
          <BlockFields
            block={block}
            media={media}
            editable={editable}
            onChange={onChange}
          />
        </div>
      ) : null}
    </article>
  );
}

function BlockFields({
  block,
  media,
  editable,
  onChange,
}: {
  block: Block;
  media: Array<{ id: string; title: string | null; url: string; type: string }>;
  editable: boolean;
  onChange: (patch: Partial<Block>) => void;
}) {
  const [lessonDraft, setLessonDraft] = useState(() => JSON.stringify(block.lessonContent || {}, null, 2));
  useEffect(() => setLessonDraft(JSON.stringify(block.lessonContent || {}, null, 2)), [block.lessonContent]);
  const input =
    "w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--br-brand)] disabled:opacity-70";
  if (block.type === "lesson") {
    return (
      <div className="grid gap-3">
        <label className="text-xs font-bold text-[var(--br-text-muted)]">
          Lesson block type
          <select
            value={block.lessonType || "TEXT"}
            disabled={!editable}
            onChange={(event) => onChange({ lessonType: event.target.value as LessonBlockType })}
            className={`${input} mt-1.5 bg-surface`}
          >
            {LESSON_BLOCK_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[var(--br-text-muted)]">
          Block content (JSON)
          <textarea
            value={lessonDraft}
            disabled={!editable}
            rows={12}
            onChange={(event) => {
              setLessonDraft(event.target.value);
              try { onChange({ lessonContent: JSON.parse(event.target.value) as Record<string, unknown> }); } catch { /* wait for valid JSON */ }
            }}
            className={`${input} mt-1.5 resize-y font-mono text-xs leading-5`}
            spellCheck={false}
          />
        </label>
        <p className="text-xs leading-5 text-[var(--br-text-muted)]">This uses the same block type and content shape as lesson slides. Choose a type, then edit its fields in JSON without creating a second blog-specific schema.</p>
      </div>
    );
  }
  if (block.type === "paragraph")
    return (
      <textarea
        value={block.text || ""}
        disabled={!editable}
        onChange={(event) => onChange({ text: event.target.value })}
        rows={5}
        placeholder="Write helpful, people-first content…"
        className={`${input} resize-y leading-7`}
      />
    );
  if (block.type === "heading")
    return (
      <div className="flex gap-2">
        <select
          value={block.level || 2}
          disabled={!editable}
          onChange={(event) =>
            onChange({ level: Number(event.target.value) as 2 | 3 | 4 })
          }
          className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-2 text-sm font-bold"
        >
          <option value={2}>H2</option>
          <option value={3}>H3</option>
          <option value={4}>H4</option>
        </select>
        <input
          value={block.text || ""}
          disabled={!editable}
          onChange={(event) => onChange({ text: event.target.value })}
          className={input}
        />
      </div>
    );
  if (block.type === "quote")
    return (
      <div className="space-y-2">
        <textarea
          value={block.text || ""}
          disabled={!editable}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={3}
          placeholder="Quote"
          className={`${input} resize-y`}
        />
        <input
          value={block.attribution || ""}
          disabled={!editable}
          onChange={(event) => onChange({ attribution: event.target.value })}
          placeholder="Attribution (optional)"
          className={input}
        />
      </div>
    );
  if (block.type === "callout")
    return (
      <div className="flex gap-2">
        <select
          value={block.tone || "TIP"}
          disabled={!editable}
          onChange={(event) =>
            onChange({ tone: event.target.value as "IDEA" | "TIP" | "NOTE" })
          }
          className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-2 text-sm"
        >
          <option value="TIP">Tip</option>
          <option value="IDEA">Idea</option>
          <option value="NOTE">Note</option>
        </select>
        <textarea
          value={block.text || ""}
          disabled={!editable}
          onChange={(event) => onChange({ text: event.target.value })}
          rows={3}
          className={`${input} resize-y`}
        />
      </div>
    );
  if (block.type === "list")
    return (
      <div className="space-y-2">
        <select
          value={block.style || "BULLET"}
          disabled={!editable}
          onChange={(event) =>
            onChange({ style: event.target.value as "BULLET" | "NUMBERED" })
          }
          className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-2 py-2 text-sm"
        >
          <option value="BULLET">Bulleted list</option>
          <option value="NUMBERED">Numbered list</option>
        </select>
        {(block.items || []).map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={item}
              disabled={!editable}
              onChange={(event) =>
                onChange({
                  items: (block.items || []).map((current, currentIndex) =>
                    currentIndex === index ? event.target.value : current,
                  ),
                })
              }
              className={input}
            />
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                onChange({
                  items: (block.items || []).filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                })
              }
              className="grid size-9 place-items-center rounded-xl border border-[var(--br-border)] text-rose-600"
              aria-label="Remove list item"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {editable ? (
          <button
            type="button"
            onClick={() =>
              onChange({ items: [...(block.items || []), "New point"] })
            }
            className="text-xs font-bold text-[var(--br-brand)]"
          >
            + Add point
          </button>
        ) : null}
      </div>
    );
  if (block.type === "image") {
    const imageMedia = media.filter((item) => item.type === "IMAGE");
    return (
      <div className="space-y-2">
        <select
          value=""
          disabled={!editable}
          onChange={(event) => {
            if (event.target.value) onChange({ src: event.target.value });
          }}
          className={input}
        >
          <option value="">Choose an image from Media Library</option>
          {imageMedia.map((item) => (
            <option key={item.id} value={item.url}>
              {item.title || "Untitled image"}
            </option>
          ))}
        </select>
        <input
          value={block.src || ""}
          disabled={!editable}
          onChange={(event) => onChange({ src: event.target.value })}
          placeholder="Image URL"
          className={input}
        />
        {block.src ? (
          <img
            src={block.src}
            alt=""
            className="max-h-56 w-full rounded-xl object-contain"
          />
        ) : null}
        <input
          value={block.alt || ""}
          disabled={!editable}
          onChange={(event) => onChange({ alt: event.target.value })}
          placeholder="Accessible image description"
          className={input}
        />
        <input
          value={block.caption || ""}
          disabled={!editable}
          onChange={(event) => onChange({ caption: event.target.value })}
          placeholder="Caption (optional)"
          className={input}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input
        value={block.label || ""}
        disabled={!editable}
        onChange={(event) => onChange({ label: event.target.value })}
        placeholder="Button label"
        className={input}
      />
      <input
        value={block.href || ""}
        disabled={!editable}
        onChange={(event) => onChange({ href: event.target.value })}
        placeholder="https://… or /courses"
        className={input}
      />
      <textarea
        value={block.description || ""}
        disabled={!editable}
        onChange={(event) => onChange({ description: event.target.value })}
        rows={2}
        placeholder="Short supporting copy"
        className={`${input} resize-y`}
      />
    </div>
  );
}

function WorkspaceModal({
  open,
  onClose,
  title,
  children,
}: {
  open: string | null;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--br-border)] px-5 py-4">
          <h2 className="min-w-0 flex-1 text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function EditorPreview({
  title,
  excerpt,
  blocks,
  coverUrl = null,
  full = false,
}: {
  title: string;
  excerpt: string;
  blocks: Block[];
  coverUrl?: string | null;
  full?: boolean;
}) {
  return (
    <div className={`mx-auto space-y-5 ${full ? "max-w-4xl" : "p-2 pt-4"}`}>
      {!full ? (
        <p className="text-sm font-bold text-ink">Reader preview</p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
        <div
          className={full ? "p-6 sm:p-10" : "bg-[var(--br-surface-muted)] p-3"}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">
            BrenUp Journal
          </p>
          <h2
            className={`mt-2 font-bold leading-tight text-ink ${full ? "text-3xl sm:text-4xl" : "text-lg"}`}
          >
            {title || "Untitled post"}
          </h2>
          {excerpt ? (
            <p
              className={`mt-3 leading-7 text-[var(--br-text-muted)] ${full ? "text-base" : "text-xs leading-5"}`}
            >
              {excerpt}
            </p>
          ) : null}
        </div>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="aspect-[16/7] w-full object-cover"
          />
        ) : null}
      </div>
      <div
        className={`space-y-4 text-ink ${full ? "px-2 text-base leading-8 sm:px-8" : "text-sm leading-6"}`}
      >
        {(full ? blocks : blocks.slice(0, 5)).map((block) => (
          <PreviewBlock key={block.id} block={block} />
        ))}
        {!full && blocks.length > 5 ? (
          <p className="text-xs font-semibold text-[var(--br-text-muted)]">
            + {blocks.length - 5} more blocks
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PreviewBlock({ block }: { block: Block }) {
  if (block.type === "lesson") {
    const content = block.lessonContent || {};
    const text = (key: string) => typeof content[key] === "string" ? String(content[key]) : "";
    if (block.lessonType === "DIVIDER") return <hr className="border-[var(--br-border)]" />;
    if (block.lessonType === "BULLETS") return <ul className="list-disc space-y-1 pl-5">{(Array.isArray(content.items) ? content.items : []).map((item, index) => <li key={index}>{String(item)}</li>)}</ul>;
    if (block.lessonType === "IMAGE_TEXT") return <div className="grid gap-3 sm:grid-cols-2"><img src={text("image_path")} alt={text("alt")} className="w-full rounded-xl object-contain" /><p className="whitespace-pre-wrap">{text("text") || text("body")}</p></div>;
    if (block.lessonType === "AUDIO") return <audio controls src={text("path")} className="w-full" />;
    if (block.lessonType === "VIDEO") return <video controls src={text("url")} className="w-full rounded-xl" />;
    if (block.lessonType === "COMMON_MISTAKE") return <div className="rounded-xl border border-[var(--br-action)]/25 bg-[var(--br-action)]/5 p-3 whitespace-pre-wrap">{text("body") || text("explanation") || text("correction")}</div>;
    return <div className="whitespace-pre-wrap">{text("body") || text("passage") || text("explanation") || text("title")}</div>;
  }
  if (block.type === "heading")
    return (
      <h3 className={block.level === 2 ? "text-lg font-bold" : "font-bold"}>
        {block.text}
      </h3>
    );
  if (block.type === "quote")
    return (
      <blockquote className="border-l-2 border-[var(--br-action)] pl-3 italic text-[var(--br-text-muted)]">
        {block.text}
        {block.attribution ? (
          <footer className="mt-1 text-xs not-italic">
            — {block.attribution}
          </footer>
        ) : null}
      </blockquote>
    );
  if (block.type === "callout")
    return (
      <div className="rounded-xl border border-[var(--br-action)]/25 bg-[var(--br-action)]/5 p-3 text-xs">
        {block.text}
      </div>
    );
  if (block.type === "list")
    return block.style === "NUMBERED" ? (
      <ol className="list-decimal space-y-1 pl-5">
        {(block.items || []).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ol>
    ) : (
      <ul className="list-disc space-y-1 pl-5">
        {(block.items || []).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  if (block.type === "image")
    return block.src ? (
      <figure>
        <img
          src={block.src}
          alt={block.alt || ""}
          className="max-h-44 w-full rounded-xl object-cover"
        />
        {block.caption ? (
          <figcaption className="mt-1 text-[11px] text-[var(--br-text-muted)]">
            {block.caption}
          </figcaption>
        ) : null}
      </figure>
    ) : (
      <div className="grid h-20 place-items-center rounded-xl bg-[var(--br-surface-muted)] text-xs text-[var(--br-text-muted)]">
        Image placeholder
      </div>
    );
  if (block.type === "cta")
    return (
      <div className="rounded-xl bg-[var(--br-dark-card)] p-3 text-on-dark">
        <p className="font-bold">{block.label}</p>
        <p className="mt-1 text-xs text-white/70">{block.description}</p>
      </div>
    );
  return (
    <>
      {parseBlogRichText(block.text || "").map((segment, index) =>
        segment.kind === "paragraph" ? (
          <p key={index}>{segment.text}</p>
        ) : segment.kind === "bullet" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {segment.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {segment.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ol>
        ),
      )}
    </>
  );
}

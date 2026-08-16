import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export type KnowledgeKind = "docs" | "blog";

export type KnowledgeEntry = {
  kind: KnowledgeKind;
  slug: string[];
  url: string;
  title: string;
  description: string;
  group: string;
  order: number;
  audience: string[];
  publishedAt?: string;
  author?: string;
  tags: string[];
  readingMinutes: number;
  content: string;
};

const contentRoot = path.join(process.cwd(), "content");

function allMarkdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return allMarkdownFiles(target);
    return /\.mdx?$/i.test(entry.name) ? [target] : [];
  });
}

function humanize(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readEntry(kind: KnowledgeKind, filePath: string): KnowledgeEntry {
  const root = path.join(contentRoot, kind);
  const relative = path.relative(root, filePath).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.mdx?$/i, "");
  const rawSlug = withoutExtension === "index" ? [] : withoutExtension.replace(/\/index$/, "").split("/");
  const source = fs.readFileSync(filePath, "utf8");
  const parsed = matter(source);
  const content = parsed.content.trim();
  const words = content.replace(/[`*_#>[\]()/]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const frontmatter = parsed.data as Record<string, unknown>;
  const title = typeof frontmatter.title === "string" ? frontmatter.title : humanize(rawSlug.at(-1) ?? kind);
  const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
  const group = typeof frontmatter.group === "string" ? frontmatter.group : kind === "docs" ? "General" : "Articles";
  const audience = Array.isArray(frontmatter.audience) ? frontmatter.audience.filter((item): item is string => typeof item === "string") : [];
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((item): item is string => typeof item === "string") : [];
  const prefix = kind === "docs" ? "/docs" : "/blog";

  return {
    kind,
    slug: rawSlug,
    url: rawSlug.length ? `${prefix}/${rawSlug.join("/")}` : prefix,
    title,
    description,
    group,
    order: typeof frontmatter.order === "number" ? frontmatter.order : 999,
    audience,
    publishedAt: typeof frontmatter.publishedAt === "string" ? frontmatter.publishedAt : undefined,
    author: typeof frontmatter.author === "string" ? frontmatter.author : undefined,
    tags,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
    content,
  };
}

export function getKnowledgeEntries(kind: KnowledgeKind) {
  return allMarkdownFiles(path.join(contentRoot, kind))
    .map((filePath) => readEntry(kind, filePath))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getKnowledgeEntry(kind: KnowledgeKind, slug?: string[]) {
  const requested = slug?.join("/") ?? "";
  return getKnowledgeEntries(kind).find((entry) => entry.slug.join("/") === requested);
}

export function getKnowledgeGroups(kind: KnowledgeKind) {
  const groups = new Map<string, KnowledgeEntry[]>();
  for (const entry of getKnowledgeEntries(kind)) {
    const entries = groups.get(entry.group) ?? [];
    entries.push(entry);
    groups.set(entry.group, entries);
  }
  return [...groups.entries()].map(([title, entries]) => ({ title, entries }));
}

export async function renderKnowledgeMarkdown(content: string) {
  const renderer = new marked.Renderer();
  // Documentation is maintained in the repository. Still disallow raw HTML
  // so a future contributor cannot accidentally inject markup into the site.
  renderer.html = () => "";
  return marked.parse(content, { breaks: true, gfm: true, renderer });
}

export function getKnowledgeSearchIndex() {
  return (["docs", "blog"] as KnowledgeKind[])
    .flatMap((kind) => getKnowledgeEntries(kind))
    .map((entry) => ({
      title: entry.title,
      description: entry.description,
      content: entry.content,
      url: entry.url,
      keywords: [...entry.audience, ...entry.tags, entry.group].join(" "),
    }));
}

import type { JSONContent } from "@tiptap/core";

export type LegacyBlogBlock = {
  id?: string;
  type: "paragraph" | "heading" | "quote" | "callout" | "list" | "image" | "cta";
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
};

const textNode = (text: string): JSONContent => ({ type: "text", text });

function paragraphsFromText(text: string) {
  return text.split(/\r?\n/).map((line) => ({ type: "paragraph", content: line ? [textNode(line)] : [] }));
}

export function legacyBlocksToTiptap(blocks: LegacyBlogBlock[]): JSONContent {
  const content: JSONContent[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") content.push(...paragraphsFromText(block.text || ""));
    else if (block.type === "heading") content.push({ type: "heading", attrs: { level: block.level || 2 }, content: block.text ? [textNode(block.text)] : [] });
    else if (block.type === "quote") content.push({ type: "blockquote", content: [{ type: "paragraph", content: block.text ? [textNode(block.text)] : [] }] });
    else if (block.type === "list") {
      content.push({ type: block.style === "NUMBERED" ? "orderedList" : "bulletList", content: (block.items || []).map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: item ? [textNode(item)] : [] }] })) });
    } else if (block.type === "image") {
      content.push({ type: "blogImage", attrs: { src: block.src || "", alt: block.alt || "", caption: block.caption || "" } });
    } else if (block.type === "callout") {
      content.push({ type: "blogCallout", attrs: { tone: block.tone || "TIP", text: block.text || "" } });
    } else if (block.type === "cta") {
      content.push({ type: "blogCta", attrs: { label: block.label || "", href: block.href || "", description: block.description || "" } });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function normalizeBlogDocument(content: { type?: string; content?: unknown } | null | undefined): JSONContent {
  const savedNodes = Array.isArray(content?.content) ? content.content : [];
  const isTiptapDocument = savedNodes.some((item) => {
    if (!item || typeof item !== "object") return false;
    const node = item as { type?: string; content?: unknown };
    return Array.isArray(node.content) || ["text", "bulletList", "orderedList", "blockquote", "hardBreak", "blogCallout", "blogImage", "blogCta"].includes(node.type || "");
  });
  if (content?.type === "doc" && Array.isArray(content.content) && isTiptapDocument) {
    return content as JSONContent;
  }
  const blocks = Array.isArray(content?.content) ? content.content.filter((item): item is LegacyBlogBlock => Boolean(item && typeof item === "object" && typeof (item as { type?: unknown }).type === "string")) : [];
  return legacyBlocksToTiptap(blocks);
}

export function tiptapToLegacyBlocks(document: JSONContent): LegacyBlogBlock[] {
  const blocks: LegacyBlogBlock[] = [];
  for (const node of document.content || []) {
    const inlineText = (value: JSONContent | undefined): string => (value?.content || []).map((child) => child.text || inlineText(child)).join("");
    if (node.type === "paragraph") blocks.push({ type: "paragraph", text: inlineText(node) });
    else if (node.type === "heading") blocks.push({ type: "heading", level: Number(node.attrs?.level) as 2 | 3 | 4, text: inlineText(node) });
    else if (node.type === "blockquote") blocks.push({ type: "quote", text: inlineText(node) });
    else if (node.type === "bulletList" || node.type === "orderedList") blocks.push({ type: "list", style: node.type === "orderedList" ? "NUMBERED" : "BULLET", items: (node.content || []).map((item) => inlineText(item)) });
    else if (node.type === "blogImage") blocks.push({ type: "image", src: String(node.attrs?.src || ""), alt: String(node.attrs?.alt || ""), caption: String(node.attrs?.caption || "") });
    else if (node.type === "blogCallout") blocks.push({ type: "callout", tone: (node.attrs?.tone as LegacyBlogBlock["tone"]) || "TIP", text: String(node.attrs?.text || "") });
    else if (node.type === "blogCta") blocks.push({ type: "cta", label: String(node.attrs?.label || ""), href: String(node.attrs?.href || ""), description: String(node.attrs?.description || "") });
  }
  return blocks.length ? blocks : [{ type: "paragraph", text: "" }];
}

export function blogDocumentText(document: JSONContent): string {
  const collect = (node: JSONContent): string => {
    if (node.text) return node.text;
    return (node.content || []).map(collect).join("\n");
  };
  return collect(document).replace(/\n{3,}/g, "\n\n").trim();
}

import type { JSONContent } from "@tiptap/core";

export function parseCourseOverview(value: string | null | undefined): JSONContent | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && (parsed as JSONContent).type === "doc") return parsed as JSONContent;
  } catch {
    // Older courses store plain text; the existing text renderer remains in use.
  }
  return null;
}

export function courseOverviewInitialContent(value: string | null | undefined): JSONContent {
  const rich = parseCourseOverview(value);
  if (rich) return rich;
  const lines = (value ?? "").split("\n");
  const blocks: JSONContent[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", content: [{ type: "text", text: paragraph.join(" ") }] });
    paragraph = [];
  };
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { flushParagraph(); index += 1; continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", attrs: { level: Math.min(4, Math.max(2, heading[1].length)) }, content: [{ type: "text", text: heading[2] }] });
      index += 1;
      continue;
    }
    const listItem = line.match(/^[-*+]\s+(.+)$/);
    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (listItem || orderedItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = ordered ? current.match(/^\d+[.)]\s+(.+)$/) : current.match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: match[1] }] }] });
        index += 1;
      }
      blocks.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return {
    type: "doc",
    content: blocks.length ? blocks : [{ type: "paragraph" }],
  };
}

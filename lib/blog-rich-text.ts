export type BlogRichTextSegment =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; items: string[] }
  | { kind: "numbered"; items: string[] };

/**
 * Lets a single writing block keep normal paragraphs and lists pasted from a
 * document. The stored source stays portable plain text rather than unsafe HTML.
 */
export function parseBlogRichText(value: string): BlogRichTextSegment[] {
  const lines = value.replace(/\r/g, "").split("\n");
  const result: BlogRichTextSegment[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) result.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? "bullet" : "numbered";
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const match = kind === "bullet"
          ? candidate.match(/^[-*•]\s+(.+)$/)
          : candidate.match(/^\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      index -= 1;
      if (items.length) result.push({ kind, items });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return result;
}

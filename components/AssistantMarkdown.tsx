import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) parts.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={`${match.index}-code`} className="rounded bg-[var(--br-surface-muted)] px-1.5 py-0.5 text-[0.9em] text-[var(--br-brand)]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("*")) parts.push(<em key={`${match.index}-em`}>{token.slice(1, -1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token);
      if (link && /^(https?:\/\/|mailto:)/i.test(link[2])) parts.push(<a key={`${match.index}-link`} href={link[2]} target="_blank" rel="noreferrer" className="font-bold text-[var(--br-brand)] underline decoration-[var(--br-brand)]/40 underline-offset-2">{link[1]}</a>);
      else parts.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function AssistantMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.trim().startsWith("```");
    if (fence) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith("```")) { code.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-2xl bg-[var(--br-dark-card)] p-4 text-xs leading-5 text-white"><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const level = heading[1].length;
      const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push(<Tag key={`heading-${index}`} className={`${level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base"} font-black leading-tight text-ink`}>{inline(heading[2])}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) { blocks.push(<hr key={`rule-${index}`} className="border-[var(--br-border)]" />); index += 1; continue; }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      const start = ordered ? Number(ordered[1]) : undefined;
      while (index < lines.length) {
        const current = orderedList ? /^\s*(\d+)[.)]\s+(.+)$/.exec(lines[index]) : /^\s*[-*+]\s+(.+)$/.exec(lines[index]);
        if (!current) break;
        items.push(orderedList ? current[2] : current[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} start={orderedList ? start : undefined} className={`${orderedList ? "list-decimal" : "list-disc"} space-y-1.5 pl-6 text-sm leading-6 text-ink`}>{items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{inline(item)}</li>)}</List>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/, "")); index += 1; }
      blocks.push(<blockquote key={`quote-${index}`} className="border-l-4 border-[var(--br-brand)]/40 pl-4 text-sm italic leading-6 text-[var(--br-text-muted)]">{quote.map((item) => <p key={item}>{inline(item)}</p>)}</blockquote>);
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index].trim()) && !/^\s*([-*+]\s+|\d+[.)]\s+|>|```)/.test(lines[index])) { paragraph.push(lines[index]); index += 1; }
    blocks.push(<p key={`paragraph-${index}`} className="text-sm leading-7 text-ink">{paragraph.map((item, itemIndex) => <span key={`${index}-${itemIndex}`}>{itemIndex ? <br /> : null}{inline(item)}</span>)}</p>);
  }
  return <div className="space-y-4">{blocks}</div>;
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Mark, Node as TiptapNode, mergeAttributes, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, Underline, Strikethrough, Link2, RemoveFormatting, TextCursorInput } from "lucide-react";
import { ColorPickerPopover } from "@/components/ColorPickerPopover";

const InlineStyle = Mark.create({
  name: "inlineStyle",
  inclusive: false,
  addAttributes() {
    return {
      color: { default: null, parseHTML: (el: HTMLElement) => /^#[\da-f]{6}$/i.test(el.style.color) ? el.style.color : null, renderHTML: (attrs) => attrs.color ? { style: `color: ${attrs.color}` } : {} },
      fontSize: { default: null, parseHTML: (el: HTMLElement) => { const n = Number.parseInt(el.style.fontSize, 10); return n >= 10 && n <= 48 ? n : null; }, renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}px` } : {} },
    };
  },
  parseHTML() { return [{ tag: "span" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", HTMLAttributes, 0]; },
});

const VisualBlank = TiptapNode.create({
  name: "visualBlank",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  parseHTML() { return [{ tag: "span[data-visual-blank]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes, { "data-visual-blank": "true", class: "whitespace-nowrap" }), "_____"]; },
});

const extensions = [StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false }), Link.configure({ openOnClick: false, protocols: ["http", "https", "mailto"] }), InlineStyle, VisualBlank];

function escapeInline(value: string) { return value.replace(/([\\*_~\[\]])/g, "\\$1"); }
function serializeMarked(value: string, marks: JSONContent["marks"], allowLink = true) {
  for (const mark of marks || []) {
    const attrs = mark.attrs || {};
    if (mark.type === "bold") value = `**${value}**`;
    else if (mark.type === "italic") value = `_${value}_`;
    else if (mark.type === "underline") value = `__${value}__`;
    else if (mark.type === "strike") value = `~~${value}~~`;
    else if (allowLink && mark.type === "link") value = `[${value}](${String(attrs.href || "")})`;
    else if (mark.type === "inlineStyle" && /^#[\da-f]{6}$/i.test(String(attrs.color || ""))) value = `[[color:${attrs.color}|${value}]]`;
    else if (mark.type === "inlineStyle" && Number(attrs.fontSize) >= 10) value = `[[size:${Math.min(48, Number(attrs.fontSize))}|${value}]]`;
  }
  return value;
}
function serializeInline(node: JSONContent): string {
  if (node.type === "visualBlank") return serializeMarked("⟦visual-blank⟧", node.marks, false);
  if (node.type === "text") {
    return serializeMarked(escapeInline(node.text || ""), node.marks);
  }
  if (node.type === "hardBreak") return "\n";
  return (node.content || []).map(serializeInline).join("");
}
function serializeDocument(doc: JSONContent) { return (doc.content || []).map((node) => serializeInline(node)).join("\n"); }

function markdownToHtml(value: string) {
  const visualBlanks: string[] = [];
  const withVisualBlankTokens = value.replace(/⟦visual-blank⟧/g, () => `\uE002${visualBlanks.push("blank") - 1}\uE003`);
  const escapedCharacters: string[] = [];
  const protectedValue = withVisualBlankTokens.replace(/\\([\\*_~\[\]])/g, (_match, character: string) => {
    const index = escapedCharacters.push(character) - 1;
    return `\uE000${index}\uE001`;
  });
  const escaped = protectedValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\[\[color:(#[\da-f]{6})\|([\s\S]*?)\]\]/gi, '<span style="color: $1">$2</span>')
    .replace(/\[\[size:(\d{2})\|([\s\S]*?)\]\]/g, (_match, size: string, content: string) => `<span style="font-size: ${Math.min(48, Math.max(10, Number(size)))}px">${content}</span>`);
  const html = escaped.split(/(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|_[^_]+_|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]*\))/g).map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) return `<strong>${part.slice(2, -2)}</strong>`;
    if (part.startsWith("__") && part.endsWith("__")) return `<u>${part.slice(2, -2)}</u>`;
    if (part.startsWith("~~") && part.endsWith("~~")) return `<s>${part.slice(2, -2)}</s>`;
    if (part.startsWith("_") && part.endsWith("_")) return `<em>${part.slice(1, -1)}</em>`;
    const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]*)\)$/);
    if (link) return `<a href="${link[2]}">${link[1]}</a>`;
    return part;
  }).join("").replace(/\n/g, "<br>");
  return html
    .replace(/\uE000(\d+)\uE001/g, (_match, index: string) => escapedCharacters[Number(index)] ?? "")
    .replace(/\uE002(\d+)\uE003/g, () => '<span data-visual-blank="true" class="whitespace-nowrap">_____</span>');
}

export function InlineRichTextField({ name, label, value, rows, lang, onChange }: { name: string; label: string; value: string; rows: number; lang?: string; onChange?: (value: string) => void }) {
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [textColor, setTextColor] = useState("#29283A");
  const [fontSize, setFontSize] = useState("16");
  const [serializedValue, setSerializedValue] = useState(value);
  const savedSelection = useRef<{ from: number; to: number } | null>(null);
  const editor = useEditor({
    extensions,
    content: markdownToHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: `rich-inline-editor w-full ${rows === 2 ? "min-h-14" : "min-h-28"} rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 text-sm leading-6 outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15 [&_p]:m-0`, "aria-label": label, ...(lang ? { lang } : {}) },
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (event.button === 2) {
            const { from, to, empty } = view.state.selection;
            if (!empty) savedSelection.current = { from, to };
          }
          return false;
        },
        contextmenu: (view, event) => {
          const { from, to } = view.state.selection;
          savedSelection.current = { from, to };
          event.preventDefault();
          setToolbarOpen(true);
          return true;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = serializeDocument(current.getJSON() as JSONContent);
      setSerializedValue(next);
      onChange?.(next);
    },
  });
  const restoreSelection = useCallback(() => {
    if (editor && savedSelection.current) editor.commands.setTextSelection(savedSelection.current);
  }, [editor]);
  const run = useCallback((action: () => void) => { restoreSelection(); action(); editor?.view.focus(); }, [editor, restoreSelection]);
  const applyInlineStyle = useCallback((attributes: { color?: string; fontSize?: number }) => {
    if (!editor) return;
    restoreSelection();
    const chain = editor.chain().focus();
    if (editor.isActive("inlineStyle")) chain.updateAttributes("inlineStyle", attributes).run();
    else chain.setMark("inlineStyle", attributes).run();
  }, [editor, restoreSelection]);
  useEffect(() => { if (!editor) return; const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest("[data-rich-toolbar]")) setToolbarOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [editor]);

  return <div className="relative mt-1">
    <input type="hidden" name={name} value={serializedValue} />
    {toolbarOpen && editor ? <div data-rich-toolbar role="toolbar" aria-label="Text formatting" className="mx-auto mb-2 flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-visible rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-1.5 shadow-lg" onMouseDown={(event) => { if (!(event.target as HTMLElement).closest("select, input")) event.preventDefault(); }}>
      {!editor.state.selection.empty ? <>
      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => run(() => editor.chain().focus().toggleBold().run())}><Bold size={15} /></ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}><Italic size={15} /></ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}><Underline size={15} /></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}><Strikethrough size={15} /></ToolbarButton>
      <ColorPickerPopover label="Text color" value={textColor} defaultValue="#29283A" kind="font" onApply={(color) => { setTextColor(color); applyInlineStyle({ color }); }} />
      <select aria-label="Text size" value={fontSize} onChange={(event) => { const size = event.target.value; setFontSize(size); applyInlineStyle({ fontSize: Number(size) }); }} className="h-8 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-1.5 text-xs"><option value="12">Small</option><option value="16">Normal</option><option value="20">Large</option><option value="24">XL</option></select>
      <ToolbarButton label="Insert link" onClick={() => { const href = window.prompt("Enter a link (https://…)"); if (href && /^(https?:\/\/|mailto:)/i.test(href)) run(() => editor.chain().focus().setLink({ href }).run()); }}><Link2 size={15} /></ToolbarButton>
      <ToolbarButton label="Clear formatting" onClick={() => run(() => editor.chain().focus().unsetAllMarks().run())}><RemoveFormatting size={15} /></ToolbarButton>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--br-border)]" />
      </> : null}
      <ToolbarButton label="Insert non-interactive blank" onClick={() => {
        const selection = editor.state.selection;
        const marks = (editor.state.storedMarks ?? selection.$from.marks()).filter((mark) => mark.type.name !== "link").map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));
        run(() => editor.chain().focus().insertContent({ type: "visualBlank", marks }).run());
      }}><TextCursorInput size={15} /></ToolbarButton>
    </div> : null}
    <EditorContent editor={editor} />
    <p className="mt-1 text-[11px] text-[var(--br-text-muted)]">Right-click to format selected text or insert a non-interactive blank.</p>
  </div>;
}

function ToolbarButton({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={`grid size-8 place-items-center rounded-lg transition ${active ? "bg-[var(--br-brand)] text-on-dark" : "text-[var(--br-text)] hover:bg-[var(--br-surface-muted)]"}`}>{children}</button>;
}

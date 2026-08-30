"use client";

import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Bold, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";

const BlogCallout = Node.create({
  name: "blogCallout", group: "block", atom: true, selectable: true,
  addAttributes: () => ({ tone: { default: "TIP" }, text: { default: "" } }),
  parseHTML: () => [{ tag: "aside[data-blog-callout]" }],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
  renderHTML: ({ HTMLAttributes }) => ["aside", mergeAttributes(HTMLAttributes, { "data-blog-callout": "true", class: "blog-callout" }), String(HTMLAttributes.text || "")],
});

const BlogImage = Node.create({
  name: "blogImage", group: "block", atom: true, selectable: true,
  addAttributes: () => ({ src: { default: "" }, alt: { default: "" }, caption: { default: "" } }),
  parseHTML: () => [{ tag: "figure[data-blog-image]" }],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-blog-image": "true", class: "blog-image" }), ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt }], HTMLAttributes.caption ? ["figcaption", {}, HTMLAttributes.caption] : ""],
});

const BlogCta = Node.create({
  name: "blogCta", group: "block", atom: true, selectable: true,
  addAttributes: () => ({ label: { default: "" }, href: { default: "" }, description: { default: "" } }),
  parseHTML: () => [{ tag: "aside[data-blog-cta]" }],
  addNodeView: () => ReactNodeViewRenderer(CtaView),
  renderHTML: ({ HTMLAttributes }) => ["aside", mergeAttributes(HTMLAttributes, { "data-blog-cta": "true", class: "blog-cta" }), ["strong", {}, HTMLAttributes.label], ["p", {}, HTMLAttributes.description]],
});

function NodeField({ value, onChange, placeholder, multiline = false }: { value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  const className = "w-full rounded-lg border border-[var(--br-border)] bg-white/70 px-2.5 py-2 text-sm text-ink outline-none focus:border-[var(--br-brand)]";
  return multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={2} className={className} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />;
}

function CalloutView({ node, updateAttributes }: { node: { attrs: { tone?: string; text?: string } }; updateAttributes: (attrs: Record<string, string>) => void }) {
  return <NodeViewWrapper className="blog-callout"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-wide text-[var(--br-action)]">Callout</span><select value={node.attrs.tone || "TIP"} onChange={(event) => updateAttributes({ tone: event.target.value })} className="rounded-md border border-[var(--br-border)] bg-white/70 px-2 py-1 text-xs"><option value="TIP">Tip</option><option value="IDEA">Idea</option><option value="NOTE">Note</option></select></div><NodeField value={node.attrs.text || ""} onChange={(text) => updateAttributes({ text })} placeholder="Write a helpful note…" multiline /></NodeViewWrapper>;
}

function ImageView({ node, updateAttributes }: { node: { attrs: { src?: string; alt?: string; caption?: string } }; updateAttributes: (attrs: Record<string, string>) => void }) {
  return <NodeViewWrapper className="blog-image"><NodeField value={node.attrs.src || ""} onChange={(src) => updateAttributes({ src })} placeholder="Image URL" />{node.attrs.src ? <img src={node.attrs.src} alt={node.attrs.alt || ""} /> : null}<div className="mt-2 grid gap-2 sm:grid-cols-2"><NodeField value={node.attrs.alt || ""} onChange={(alt) => updateAttributes({ alt })} placeholder="Alt text" /><NodeField value={node.attrs.caption || ""} onChange={(caption) => updateAttributes({ caption })} placeholder="Caption (optional)" /></div></NodeViewWrapper>;
}

function CtaView({ node, updateAttributes }: { node: { attrs: { label?: string; href?: string; description?: string } }; updateAttributes: (attrs: Record<string, string>) => void }) {
  return <NodeViewWrapper className="blog-cta"><div className="grid gap-2"><NodeField value={node.attrs.label || ""} onChange={(label) => updateAttributes({ label })} placeholder="Button label" /><NodeField value={node.attrs.description || ""} onChange={(description) => updateAttributes({ description })} placeholder="Supporting copy" multiline /><NodeField value={node.attrs.href || ""} onChange={(href) => updateAttributes({ href })} placeholder="Link URL" /></div></NodeViewWrapper>;
}

export function BlogRichEditor({ content, editable = true, onChange }: { content: JSONContent; editable?: boolean; onChange: (content: JSONContent) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image.configure({ allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: "Start writing your article… Press / for quick actions." }),
      BlogCallout, BlogImage, BlogCta,
    ],
    editorProps: { attributes: { class: "blog-rich-editor", spellcheck: "true" } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  if (!editor) return <div className="min-h-80 rounded-xl border border-dashed border-[var(--br-border)] bg-[var(--br-surface-muted)] p-5 text-sm text-[var(--br-text-muted)]">Loading editor…</div>;

  return (
    <div className="relative">
      <BubbleMenu editor={editor} className="flex items-center gap-1 rounded-xl border border-[var(--br-border)] bg-[var(--br-dark-card)] p-1.5 text-on-dark shadow-xl">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`rounded-lg p-2 ${editor.isActive("bold") ? "bg-[var(--br-action)]" : "hover:bg-white/10"}`} aria-label="Bold"><Bold size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`rounded-lg p-2 ${editor.isActive("italic") ? "bg-[var(--br-action)]" : "hover:bg-white/10"}`} aria-label="Italic"><Italic size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`rounded-lg p-2 ${editor.isActive("bulletList") ? "bg-[var(--br-action)]" : "hover:bg-white/10"}`} aria-label="Bulleted list"><List size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`rounded-lg p-2 ${editor.isActive("orderedList") ? "bg-[var(--br-action)]" : "hover:bg-white/10"}`} aria-label="Numbered list"><ListOrdered size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`rounded-lg p-2 ${editor.isActive("blockquote") ? "bg-[var(--br-action)]" : "hover:bg-white/10"}`} aria-label="Quote"><Quote size={15} /></button>
        <button type="button" onClick={() => { const href = window.prompt("Link URL"); if (href) editor.chain().focus().setLink({ href }).run(); }} className="rounded-lg p-2 hover:bg-white/10" aria-label="Add link"><Link2 size={15} /></button>
      </BubbleMenu>
      <FloatingMenu editor={editor} className="rounded-xl border border-[var(--br-border)] bg-surface p-1 shadow-lg">
        <div className="flex flex-wrap items-center gap-1"><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-[var(--br-surface-muted)]">H2</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-[var(--br-surface-muted)]">H3</button><button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="rounded-lg p-1.5 text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]" aria-label="Add list"><List size={15} /></button><button type="button" onClick={() => editor.chain().focus().insertContent({ type: "blogCallout", attrs: { tone: "TIP", text: "" } }).run()} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]">Callout</button><button type="button" onClick={() => editor.chain().focus().insertContent({ type: "blogImage", attrs: { src: "", alt: "", caption: "" } }).run()} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]">Image</button><button type="button" onClick={() => editor.chain().focus().insertContent({ type: "blogCta", attrs: { label: "", href: "", description: "" } }).run()} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)]">CTA</button></div>
      </FloatingMenu>
      <EditorContent editor={editor} />
      <div className="mt-3 flex items-center gap-1 border-t border-[var(--br-border)] pt-3"><button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="rounded-lg p-2 text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] disabled:opacity-30" aria-label="Undo"><Undo2 size={15} /></button><button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="rounded-lg p-2 text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] disabled:opacity-30" aria-label="Redo"><Redo2 size={15} /></button><span className="ml-auto text-[11px] text-[var(--br-text-muted)]">Select text for formatting</span></div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Mark, type Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import { emptyDocument, type RichText } from "@/lib/instant-live/types";

const TextStyle = Mark.create({
  name: "textStyle",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          /^#[\da-f]{6}$/i.test(element.style.color)
            ? element.style.color
            : null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.color ? { style: `color: ${attrs.color}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          Number.parseInt(element.style.fontSize) || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.fontSize ? { style: `font-size: ${attrs.fontSize}px` } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});
const Alignment = Extension.create({
  name: "alignment",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          textAlign: {
            default: "left",
            parseHTML: (element: HTMLElement) =>
              element.style.textAlign || "left",
            renderHTML: (attrs: Record<string, unknown>) => ({
              style: `text-align: ${attrs.textAlign}`,
            }),
          },
        },
      },
    ];
  },
});
const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
  }),
  TextStyle,
  Alignment,
];
export function BoardText({
  document,
  editing,
  onChange,
  onEditor,
}: {
  document?: RichText;
  editing: boolean;
  onChange: (value: RichText, height: number) => void;
  onEditor: (editor: Editor | null) => void;
}) {
  const callbacks = useRef({ onChange, onEditor });
  callbacks.current = { onChange, onEditor };
  const editor = useEditor({
    extensions,
    content: (document ?? emptyDocument) as JSONContent,
    immediatelyRender: false,
    editable: editing,
    editorProps: {
      attributes: { class: "live-board-text", "aria-label": "Whiteboard text" },
    },
    onUpdate: ({ editor: current }) =>
      callbacks.current.onChange(
        current.getJSON() as RichText,
        current.view.dom.scrollHeight,
      ),
  });
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing);
    if (editing) {
      callbacks.current.onEditor(editor);
      editor.commands.focus("end");
    }
    return () => {
      if (editing) callbacks.current.onEditor(null);
    };
  }, [editing, editor]);
  useEffect(() => {
    if (
      editor &&
      !editing &&
      JSON.stringify(editor.getJSON()) !==
        JSON.stringify(document ?? emptyDocument)
    )
      editor.commands.setContent((document ?? emptyDocument) as JSONContent, {
        emitUpdate: false,
      });
  }, [document, editing, editor]);
  return <EditorContent editor={editor} />;
}
export function TextToolbar({ editor }: { editor: Editor }) {
  // Transactions update toolbar pressed states even when only the selection changes.
  const [, render] = useEditorTransaction(editor);
  const button = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    active = false,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={active ? "is-active" : ""}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        action();
        render();
      }}
    >
      {icon}
    </button>
  );
  return (
    <div
      className="live-text-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <select
        aria-label="Font size"
        value={Number(editor.getAttributes("textStyle").fontSize) || 28}
        onChange={(event) =>
          editor
            .chain()
            .focus()
            .setMark("textStyle", { fontSize: Number(event.target.value) })
            .run()
        }
      >
        {[12, 16, 20, 24, 28, 32, 40, 48, 64, 80, 96, 120].map((size) => (
          <option key={size}>{size}</option>
        ))}
      </select>
      {button(
        "Bold",
        <Bold size={17} />,
        () => {
          editor.chain().focus().toggleBold().run();
        },
        editor.isActive("bold"),
      )}
      {button(
        "Italic",
        <Italic size={17} />,
        () => {
          editor.chain().focus().toggleItalic().run();
        },
        editor.isActive("italic"),
      )}
      {button(
        "Underline",
        <Underline size={17} />,
        () => {
          editor.chain().focus().toggleUnderline().run();
        },
        editor.isActive("underline"),
      )}
      <input
        type="color"
        title="Text color"
        aria-label="Text color"
        value={editor.getAttributes("textStyle").color || "#24203d"}
        onChange={(event) =>
          editor
            .chain()
            .focus()
            .setMark("textStyle", { color: event.target.value })
            .run()
        }
      />
      {button(
        "Bullet list",
        <List size={17} />,
        () => {
          editor.chain().focus().toggleBulletList().run();
        },
        editor.isActive("bulletList"),
      )}
      {button(
        "Numbered list",
        <ListOrdered size={17} />,
        () => {
          editor.chain().focus().toggleOrderedList().run();
        },
        editor.isActive("orderedList"),
      )}
      {(["left", "center", "right"] as const).map((align) =>
        button(
          `Align ${align}`,
          align === "left" ? (
            <AlignLeft size={17} />
          ) : align === "center" ? (
            <AlignCenter size={17} />
          ) : (
            <AlignRight size={17} />
          ),
          () => {
            editor
              .chain()
              .focus()
              .updateAttributes("paragraph", { textAlign: align })
              .run();
          },
          editor.isActive("paragraph", { textAlign: align }),
        ),
      )}
    </div>
  );
}
function useEditorTransaction(editor: Editor): [number, () => void] {
  const [version, setVersion] = useState(0);
  const rerender = () => setVersion((value) => value + 1);
  useEffect(() => {
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);
  return [version, rerender];
}

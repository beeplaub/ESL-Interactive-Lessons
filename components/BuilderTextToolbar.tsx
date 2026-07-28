"use client";

import { Bold, Italic, Link2, Strikethrough, Underline } from "lucide-react";
import { useEffect, useState } from "react";

type Target = HTMLInputElement | HTMLTextAreaElement;

function selectedTarget(event?: Event): Target | null {
  const element = (event?.target ?? document.activeElement) as Element | null;
  return element instanceof HTMLInputElement && element.type !== "checkbox" || element instanceof HTMLTextAreaElement ? element as Target : null;
}

export function BuilderTextToolbar() {
  const [target, setTarget] = useState<Target | null>(null);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const open = (event: Event) => { const input = selectedTarget(event); if (!input || input.selectionStart === input.selectionEnd) return; setTarget(input); const mouse = event as MouseEvent; setPoint({ x: mouse.clientX || window.innerWidth / 2, y: mouse.clientY || 80 }); };
    const close = (event: MouseEvent) => { if (!(event.target as Element).closest("[data-builder-toolbar]")) setTimeout(() => setTarget(null), 0); };
    const context = (event: MouseEvent) => { const input = selectedTarget(event); if (input && input.selectionStart !== input.selectionEnd) { event.preventDefault(); open(event); } };
    document.addEventListener("mouseup", open); document.addEventListener("contextmenu", context); document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("mouseup", open); document.removeEventListener("contextmenu", context); document.removeEventListener("mousedown", close); };
  }, []);
  if (!target) return null;
  const apply = (before: string, after = before) => { const start = target.selectionStart ?? 0; const end = target.selectionEnd ?? start; const text = target.value.slice(start, end); target.setRangeText(`${before}${text}${after}`, start, end, "end"); target.dispatchEvent(new Event("input", { bubbles: true })); target.focus(); setTarget(null); };
  const link = () => { const url = window.prompt("Link URL"); if (url) apply("[", `](${url})`); };
  return <div data-builder-toolbar className="fixed z-[100] flex items-center gap-1 rounded-xl border border-[#E4E4EE] bg-white p-1.5 shadow-[0_12px_32px_rgba(27,27,58,.18)]" style={{ left: Math.min(point.x, window.innerWidth - 260), top: Math.max(8, point.y - 52) }}><button type="button" title="Text colour" onClick={() => apply("[[color:#FF7A59|", "]]" )} className="grid size-8 place-items-center rounded-lg text-[#FF7A59] hover:bg-[#F5F2FE]">A</button><button type="button" title="Bold" onClick={() => apply("**")} className="grid size-8 place-items-center rounded-lg hover:bg-[#F5F2FE]"><Bold size={15}/></button><button type="button" title="Italic" onClick={() => apply("_")} className="grid size-8 place-items-center rounded-lg hover:bg-[#F5F2FE]"><Italic size={15}/></button><button type="button" title="Underline" onClick={() => apply("__")} className="grid size-8 place-items-center rounded-lg hover:bg-[#F5F2FE]"><Underline size={15}/></button><button type="button" title="Link" onClick={link} className="grid size-8 place-items-center rounded-lg hover:bg-[#F5F2FE]"><Link2 size={15}/></button><button type="button" title="Strikethrough" onClick={() => apply("~~")} className="grid size-8 place-items-center rounded-lg hover:bg-[#F5F2FE]"><Strikethrough size={15}/></button></div>;
}

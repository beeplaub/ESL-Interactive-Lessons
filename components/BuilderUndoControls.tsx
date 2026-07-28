"use client";

import { Redo2, Undo2 } from "lucide-react";
import { usePathname } from "next/navigation";

export function BuilderUndoControls() {
  const pathname = usePathname();
  const active = pathname.includes("/builder") || pathname.includes("/admin/quizzes/");
  if (!active) return null;
  const command = (name: "undo" | "redo") => { document.execCommand(name); (document.activeElement as HTMLElement | null)?.dispatchEvent(new Event("input", { bubbles: true })); };
  return <div className="fixed bottom-5 right-5 z-[80] hidden overflow-hidden rounded-xl border border-[#E4E4EE] bg-white shadow-lg sm:flex"><button type="button" title="Undo (Ctrl/Command Z)" onClick={() => command("undo")} className="grid size-10 place-items-center text-[#3E3A72] hover:bg-[#F5F2FE]"><Undo2 size={17}/></button><button type="button" title="Redo (Ctrl/Command Shift Z)" onClick={() => command("redo")} className="grid size-10 place-items-center border-l border-[#E4E4EE] text-[#3E3A72] hover:bg-[#F5F2FE]"><Redo2 size={17}/></button></div>;
}

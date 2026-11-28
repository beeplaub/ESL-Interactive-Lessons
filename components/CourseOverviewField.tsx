"use client";

import { useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { BlogRichEditor } from "@/components/BlogRichEditor";
import { courseOverviewInitialContent } from "@/lib/courseOverview";

export function CourseOverviewField({ value }: { value: string | null }) {
  const [content, setContent] = useState<JSONContent>(() => courseOverviewInitialContent(value));
  return <>
    <input type="hidden" name="description" value={JSON.stringify(content)} />
    <div className="mt-2 rounded-xl border border-[var(--br-border)] bg-white p-3 sm:p-4">
      <BlogRichEditor content={content} onChange={setContent} courseOverview />
    </div>
    <span className="mt-1 block text-xs font-normal text-[var(--br-text-muted)]">Select text to style it. Use the toolbar for headings, lists, bold, italic, and theme colors.</span>
  </>;
}

"use client";

import type { JSONContent } from "@tiptap/core";
import { BlogRichEditor } from "@/components/BlogRichEditor";

export function CourseOverviewDisplay({ content }: { content: JSONContent }) {
  return <div className="course-overview-display rounded-2xl border border-[var(--br-border)] p-4 sm:p-6"><BlogRichEditor content={content} editable={false} onChange={() => undefined} courseOverview /></div>;
}

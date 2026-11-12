"use client";

import { useRef } from "react";
import { GlassDropdown } from "@/components/GlassDropdown";

export function CourseFilterControls({
  level,
  q,
  sort,
  selectedTopics,
}: {
  level: string;
  q: string;
  sort: string;
  selectedTopics: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const sortInputRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} method="GET" action="/courses" className="flex w-full items-center sm:w-auto">
      {level ? <input type="hidden" name="level" value={level} /> : null}
      {q ? <input type="hidden" name="q" value={q} /> : null}
      {selectedTopics.map((topic) => <input key={topic} type="hidden" name="topic" value={topic} />)}
      <input ref={sortInputRef} type="hidden" name="sort" value={sort} />
      <GlassDropdown
        value={sort}
        ariaLabel="Sort courses"
        align="right"
        triggerClassName="h-10 w-full rounded-lg sm:h-9 sm:w-auto"
        options={[
          { value: "popular", label: "Most Popular" },
          { value: "newest", label: "Newest" },
          { value: "az", label: "A–Z" },
          { value: "za", label: "Z–A" },
        ]}
        onChange={(value) => {
          if (sortInputRef.current) sortInputRef.current.value = value;
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

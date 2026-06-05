"use client";

import { Wand2 } from "lucide-react";
import { useState } from "react";

export function LessonTextGeneratorForm({
  action,
  hasExistingActivities
}: {
  action: (formData: FormData) => void;
  hasExistingActivities: boolean;
}) {
  const [fullText, setFullText] = useState("");

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          hasExistingActivities &&
          !window.confirm("This will overwrite all existing activity edits. Are you sure?")
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-lg border border-black/10 bg-white p-5 shadow-sm"
    >
      <details>
        <summary className="cursor-pointer list-none">
          <div>
            <p className="text-sm font-semibold text-moss">Interactive slide generation</p>
            <h2 className="mt-1 text-xl font-semibold">
              Provide full lesson text for interactive slide generation
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Paste text with [SLIDE 1], [SLIDE 2], and so on. Missing slides stay as normal image slides.
            </p>
          </div>
        </summary>
        <div className="mt-5">
          <textarea
            name="fullText"
            value={fullText}
            onChange={(event) => setFullText(event.target.value)}
            rows={14}
            className="w-full rounded-md border border-black/15 px-3 py-3 font-mono text-sm leading-6"
            placeholder={`[SLIDE 1]\nWelcome to today's lesson.\n\n[SLIDE 2]\nChoose the best answer.\n1. She said she ___ a doctor.\nA) is\nB) was\nC) were\nD) be\nANSWER: B`}
          />
          <button
            type="submit"
            disabled={!fullText.trim()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            <Wand2 size={16} /> Parse and Generate
          </button>
        </div>
      </details>
    </form>
  );
}

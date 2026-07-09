"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createCourse } from "@/app/admin/courses/actions";
import { CONTENT_LEVELS } from "@/lib/levels";

export function NewCourseModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white hover:bg-moss/90 transition shadow-sm"
      >
        <Plus size={16} /> New course
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur & overlay */}
          <div
            onClick={() => {
              if (!isSubmitting) setIsOpen(false);
            }}
            className="absolute inset-0 bg-[#0c102b]/50 backdrop-blur-sm transition-opacity"
          />

          {/* Modal content wrapper */}
          <div className="relative w-full max-w-xl scale-100 transform overflow-hidden rounded-[24px] border border-[#ECECF5] bg-white p-6 shadow-[0_24px_64px_rgba(10,13,44,0.18)] transition-all">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#ECECF5] pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#14172B]">Create course shell</h3>
                <p className="mt-1 text-xs font-semibold text-[#8B90A7]">
                  Initialize your new course outline and metadata.
                </p>
              </div>
              <button
                disabled={isSubmitting}
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-[#8B90A7] hover:bg-[#F6F7FB] hover:text-[#14172B] disabled:opacity-50 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form
              action={async (formData) => {
                handleSubmit();
                try {
                  await createCourse(formData);
                } catch (e) {
                  setIsSubmitting(false);
                  alert(e instanceof Error ? e.message : "Error creating course");
                }
              }}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8B90A7]">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Intermediate Business English"
                  className="mt-1.5 w-full rounded-xl border border-[#ECECF5] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-[#6C3BFF] focus:outline-none transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8B90A7]">
                  Subtitle
                </label>
                <input
                  name="subtitle"
                  placeholder="e.g. Master essential vocabulary and communication strategies"
                  className="mt-1.5 w-full rounded-xl border border-[#ECECF5] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-[#6C3BFF] focus:outline-none transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#8B90A7]">
                  Topic
                </label>
                <input
                  name="topic"
                  placeholder="e.g. Business Communication"
                  className="mt-1.5 w-full rounded-xl border border-[#ECECF5] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-[#6C3BFF] focus:outline-none transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#8B90A7]">
                  Target Level
                </label>
                <select
                  name="level"
                  defaultValue="All Levels"
                  className="mt-1.5 w-full rounded-xl border border-[#ECECF5] bg-white px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-[#6C3BFF] focus:outline-none transition"
                >
                  {CONTENT_LEVELS.map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#8B90A7]">
                  Description
                </label>
                <textarea
                  name="description"
                  placeholder="Write a brief overview of the learning outcomes and target audience..."
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-[#ECECF5] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-[#6C3BFF] focus:outline-none transition resize-none"
                />
              </div>

              {/* Actions Footer */}
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#ECECF5] pt-4 sm:col-span-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl px-5 py-2.5 text-sm font-extrabold text-[#6E738D] hover:bg-[#F6F7FB] disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#6C3BFF] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(108,59,255,0.25)] hover:bg-[#5C2EE5] disabled:opacity-50 transition"
                >
                  {isSubmitting ? "Creating..." : "Create and open builder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

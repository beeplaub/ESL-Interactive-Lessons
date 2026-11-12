"use client";

import { useEffect, useRef } from "react";
import { enrollInCourse } from "@/app/courses/actions";

export function AutoEnrollCourse({ courseId }: { courseId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const enrollAction = enrollInCourse.bind(null, courseId);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={enrollAction}>
      <button disabled className="br-button-primary inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold opacity-75">
        Enrolling…
      </button>
    </form>
  );
}

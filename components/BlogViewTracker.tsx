"use client";

import { useEffect } from "react";

export function BlogViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/blog/${encodeURIComponent(slug)}/view`, { method: "POST", keepalive: true, signal: controller.signal }).catch(() => undefined);
    }, 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [slug]);
  return null;
}

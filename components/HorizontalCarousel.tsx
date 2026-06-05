"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function HorizontalCarousel({
  children,
  empty
}: {
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const hasChildren = Boolean(children);

  function updateButtons() {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
  }

  function scroll(direction: "left" | "right") {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction === "left" ? -element.clientWidth : element.clientWidth,
      behavior: "smooth"
    });
  }

  useEffect(() => {
    updateButtons();
    const element = scrollRef.current;
    if (!element) return;
    element.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      element.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [children]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!canScrollLeft}
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white shadow-sm disabled:opacity-25"
        aria-label="Scroll left"
      >
        <ChevronLeft size={18} />
      </button>
      <div
        ref={scrollRef}
        className="flex scroll-smooth gap-3 overflow-x-auto px-11 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {hasChildren ? children : <div className="grid min-h-32 w-full place-items-center text-center">{empty}</div>}
      </div>
      <button
        type="button"
        disabled={!canScrollRight}
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white shadow-sm disabled:opacity-25"
        aria-label="Scroll right"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function CarouselItem({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-full sm:min-w-[calc(50%-0.375rem)]">{children}</div>;
}

"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleWishlist } from "@/app/wishlist/actions";

export function WishlistButton({
  isLoggedIn,
  lessonId,
  quizId,
  initiallySaved,
  loginNext
}: {
  isLoggedIn: boolean;
  lessonId?: string;
  quizId?: string;
  initiallySaved: boolean;
  loginNext: string;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [isPending, startTransition] = useTransition();
  const label = saved ? "Remove from wishlist" : "Add to wishlist";

  if (!isLoggedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(loginNext)}`} title="Add to wishlist" className="rounded-full border border-black/10 bg-white p-2 text-black/55 shadow-sm hover:text-coral">
        <Heart size={17} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={label}
      disabled={isPending}
      onClick={() => {
        const nextState = !saved;
        setSaved(nextState);
        startTransition(async () => {
          try {
            await toggleWishlist({ lessonId, quizId, nextState });
          } catch {
            setSaved(!nextState);
          }
        });
      }}
      className={`rounded-full border border-black/10 bg-white p-2 shadow-sm ${saved ? "text-coral" : "text-black/55 hover:text-coral"} disabled:opacity-50`}
    >
      <Heart size={17} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

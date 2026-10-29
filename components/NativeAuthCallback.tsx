"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function NativeAuthCallback({ code, nextPath }: { code: string; nextPath: string }) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code || started.current) {
      if (!code) setFailed(true);
      return;
    }
    started.current = true;

    async function completeSignIn() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        setFailed(true);
        return;
      }

      const response = await fetch("/api/auth/native-complete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          nextPath,
        }),
      });
      const result = await response.json().catch(() => null) as { redirectTo?: string } | null;
      const redirectTo = result?.redirectTo;
      if (!response.ok || !redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
        setFailed(true);
        return;
      }
      window.location.replace(redirectTo);
    }

    void completeSignIn().catch(() => setFailed(true));
  }, [code, nextPath]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-[var(--br-border)] bg-surface p-6 shadow-sm">
        {failed ? (
          <>
            <h1 className="text-2xl font-semibold">Sign-in didn’t finish</h1>
            <p className="mt-3 text-sm text-[var(--br-text-muted)]">
              Return to BrenUp and try signing in again. If it keeps happening, contact support.
            </p>
            <a href="/login" className="mt-4 inline-block rounded-md bg-dark px-4 py-2 text-sm font-semibold text-on-dark">
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Finishing sign-in</h1>
            <p className="mt-3 text-sm text-[var(--br-text-muted)]">Please wait while BrenUp opens your account.</p>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // OAuth and email callbacks are exchanged by our route handlers, or
        // explicitly by NativeAuthCallback for Android. Letting the browser
        // client also inspect `?code=` can race that exchange and consume the
        // one-time PKCE code before the intended handler processes it.
        detectSessionInUrl: false,
      },
    }
  );
}

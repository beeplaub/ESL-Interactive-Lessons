import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;

  if (params.error) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
        <div className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="mt-3 text-sm text-black/65">
            {params.error_description ?? "This password reset link has expired or already been used."}
          </p>
          <a
            href="/forgot-password"
            className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  if (!params.code) redirect("/forgot-password");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(params.code!);

  if (error) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
        <div className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="mt-3 text-sm text-black/65">
            This link has expired or already been used. Please request a new one.
          </p>
          <a
            href="/forgot-password"
            className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Set new password</h1>
        <p className="mt-2 text-sm text-black/60">
          Choose a strong password — at least 8 characters.
        </p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}

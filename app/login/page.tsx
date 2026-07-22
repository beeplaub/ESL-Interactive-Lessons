import { redirect } from "next/navigation";
import { getFreshProfile, resolvePostLoginPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getFreshProfile(user.id);
    redirect(resolvePostLoginPath(profile?.role, next));
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
      <div className="w-full br-card rounded-[24px] p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-ink">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500 font-semibold">Sign in or create a learner account to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}

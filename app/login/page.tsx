import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-black/60">Sign in or create a learner account to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}

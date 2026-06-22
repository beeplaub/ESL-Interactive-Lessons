import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4">
      <div className="w-full rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-black/55 hover:text-black"
        >
          <ArrowLeft size={15} /> Back to sign in
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-black/60">
          Enter your email and we will send you a link to reset your password.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}

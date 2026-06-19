import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ProfileForm } from "@/components/ProfileForm";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";

export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const initials = (profile?.first_name?.[0] || profile?.full_name?.[0] || user.email?.[0] || "U").toUpperCase();
  const level = profile?.cefr_level as CefrLevel | null;

  return (
    <main className="mx-auto w-full max-w-3xl overflow-hidden px-4 py-8">
      <Link href="/account" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to My Account
      </Link>
      <section className="mt-5 min-w-0 rounded-lg border border-black/10 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-3xl font-semibold">Profile</h1>
        <div className="mt-6 grid min-w-0 gap-8 md:grid-cols-[160px_minmax(0,1fr)]">
          <AvatarUploader initialUrl={profile?.avatar_url ?? null} initials={initials} />
          <div className="min-w-0">
            <ProfileForm
              email={user.email ?? ""}
              firstName={profile?.first_name ?? ""}
              lastName={profile?.last_name ?? ""}
            />

            <div className="mt-6 rounded-md border border-black/10 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <BadgeCheck className="text-moss" size={18} /> Level test result
              </div>
              {level ? (
                <p className="mt-2 text-sm text-black/65">Your level: {level} · {levelGuidance[level].name}</p>
              ) : (
                <p className="mt-2 text-sm text-black/65">You have not taken the level test yet.</p>
              )}
              <Link href="/level-test" className="mt-3 inline-flex text-sm font-medium text-moss">
                {level ? "Retake the level test" : "Take the level test"}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
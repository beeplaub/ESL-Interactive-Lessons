import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { updateProfile } from "@/app/profile/actions";
import { requireUser } from "@/lib/auth";
import { AvatarUploader } from "@/components/AvatarUploader";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";

export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const initials = (profile?.first_name?.[0] || profile?.full_name?.[0] || user.email?.[0] || "U").toUpperCase();
  const level = profile?.cefr_level as CefrLevel | null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/account" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to My Account
      </Link>
      <section className="mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold">Profile</h1>
        <div className="mt-6 grid gap-8 md:grid-cols-[160px_1fr]">
          <AvatarUploader initialUrl={profile?.avatar_url ?? null} initials={initials} />
          <div>
            <form action={updateProfile} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  First Name
                  <input name="firstName" defaultValue={profile?.first_name ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
                <label className="text-sm font-medium">
                  Last Name
                  <input name="lastName" defaultValue={profile?.last_name ?? ""} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
                </label>
              </div>
              <div className="rounded-md bg-slate-50 p-4">
                <p className="text-sm font-medium">{user.email}</p>
                <p className="mt-1 text-xs text-black/50">Email cannot be changed</p>
              </div>
              <button className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white">Save profile</button>
            </form>

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

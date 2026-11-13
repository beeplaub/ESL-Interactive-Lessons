import { requireAdmin } from "@/lib/auth";
import { listSpeechPrompts } from "@/app/admin/speech-practice/actions";
import { SpeechPracticeLibrary } from "@/components/admin/SpeechPracticeLibrary";

export const metadata = { title: "Speech Practice Library | Admin" };

export default async function SpeechPracticeLibraryPage() {
  await requireAdmin();
  const prompts = await listSpeechPrompts();
  return <main className="mx-auto max-w-7xl p-4 sm:p-6"><SpeechPracticeLibrary initialPrompts={prompts as never} /></main>;
}

import { requireAdmin } from "@/lib/auth";
import { listSpeechPracticeCategories, listSpeechPrompts } from "@/app/admin/speech-practice/actions";
import { SpeechPracticeLibrary } from "@/components/admin/SpeechPracticeLibrary";
import { getIpaChartAudioSettings } from "@/lib/ipa/audio";

export const metadata = { title: "Speech Practice Library | Admin" };

export default async function SpeechPracticeLibraryPage() {
  await requireAdmin();
  const [prompts, categories, audioState] = await Promise.all([listSpeechPrompts(), listSpeechPracticeCategories("SHADOWING"), getIpaChartAudioSettings()]);
  return <main className="mx-auto max-w-7xl p-4 sm:p-6"><SpeechPracticeLibrary initialPrompts={prompts as never} initialCategories={categories as never} initialAudioSettings={audioState.settings} audioSettingsConfigured={audioState.configured} /></main>;
}

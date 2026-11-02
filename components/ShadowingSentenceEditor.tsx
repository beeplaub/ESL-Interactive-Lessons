"use client";

import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import { FlashcardAudioGenerator, type FlashcardVoiceSettings } from "@/components/FlashcardAudioGenerator";

type Props = {
  audioUrl: string;
  targetText: string;
  onAudioUrlChange: (url: string) => void;
  onTargetTextChange: (text: string) => void;
  lessonId?: string;
  voiceSettings: FlashcardVoiceSettings;
};

export function ShadowingSentenceEditor({ audioUrl, targetText, onAudioUrlChange, onTargetTextChange, lessonId, voiceSettings }: Props) {
  return (
    <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div>
        <h3 className="text-sm font-black text-[var(--br-dark-card)]">Model sentence</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Add one complete sentence and its model audio. Learners record once, then listen to the model and their recording in a loop.</p>
      </div>
      <label className="text-sm font-medium">
        Sentence text
        <textarea rows={3} value={targetText} onChange={(event) => onTargetTextChange(event.target.value)} placeholder="e.g. I'm gonna go to the store." className="mt-1 w-full rounded-lg border border-[var(--br-border)] bg-white px-3 py-2" />
      </label>
      <MediaRecorderInput
        label="Model sentence audio"
        value={audioUrl}
        headerAction={<FlashcardAudioGenerator
          lessonId={lessonId}
          word={targetText}
          settings={voiceSettings}
          entityLabel="Shadowing model sentence"
          buttonLabel="Generate audio"
          onSaved={onAudioUrlChange}
        />}
        onChange={onAudioUrlChange}
        lessonId={lessonId}
      />
    </div>
  );
}

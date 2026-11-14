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
  promptNumber?: number;
  showHeading?: boolean;
};

export function ShadowingSentenceEditor({ audioUrl, targetText, onAudioUrlChange, onTargetTextChange, lessonId, voiceSettings, promptNumber, showHeading = true }: Props) {
  return (
    <div className="grid min-w-0 gap-2.5 rounded-xl border border-[var(--br-border)] bg-slate-50/60 p-3">
      {showHeading ? <div className="min-w-0"><h3 className="text-sm font-black text-[var(--br-dark-card)]">{promptNumber ? `Sentence ${promptNumber}` : "Model sentence"}</h3></div> : null}
      <label className="min-w-0 text-sm font-medium">
        Sentence text
        <textarea rows={2} value={targetText} onChange={(event) => onTargetTextChange(event.target.value)} placeholder="e.g. I'm gonna go to the store." className="mt-1 block w-full min-w-0 resize-y rounded-lg border border-[var(--br-border)] bg-white px-3 py-2" />
      </label>
      <MediaRecorderInput
        label={promptNumber ? `Sentence ${promptNumber} audio` : "Model sentence audio"}
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

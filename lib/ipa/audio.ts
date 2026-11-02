import "server-only";
import { z } from "zod";
import manifest from "@/content/ipa/audio.json";
import { IPA_CHARTS, plainWord, type IpaAccent, type IpaAudioManifest } from "./chart";

const recording = z.object({
  src: z.string().regex(/^\/audio\/ipa\/[a-zA-Z0-9/_-]+\.(?:mp3|wav|ogg|opus)$/),
  reviewedBy: z.string().trim().min(1),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().trim().min(1),
}).strict();
const entry = z.object({ sound: recording.optional(), words: z.record(z.string(), recording).optional() }).strict();
const schema = z.object({ uk: z.record(z.string(), entry).optional(), us: z.record(z.string(), entry).optional() }).strict();

/** Only explicitly reviewed assets are published; missing recordings remain optional. */
export function getIpaAudioManifest(): IpaAudioManifest {
  const data = schema.parse(manifest);
  for (const accent of ["uk", "us"] as IpaAccent[]) {
    for (const [id, assets] of Object.entries(data[accent] ?? {})) {
      const sound = IPA_CHARTS[accent].find(item => item.id === id);
      if (!sound) throw new Error(`Unknown IPA audio entry: ${accent}/${id}`);
      for (const word of Object.keys(assets.words ?? {})) {
        if (!sound.examples.some(example => plainWord(example) === word)) throw new Error(`Unknown IPA example: ${accent}/${id}/${word}`);
      }
    }
  }
  return data;
}

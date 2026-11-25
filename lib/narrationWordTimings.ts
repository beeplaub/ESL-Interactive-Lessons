import { createHash } from "node:crypto";

export function narrationSourceFingerprint(source: {
  storage_provider?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  transcript?: string | null;
}) {
  return createHash("md5").update([
    source.storage_provider ?? "",
    source.storage_bucket ?? "",
    source.storage_path ?? "",
    source.external_url ?? "",
    source.transcript ?? "",
  ].join("\n")).digest("hex");
}

export function narrationTranscriptWordCount(text: string) {
  return (text.match(/[^\s]+/g) ?? []).filter((token) => /[\p{L}\p{M}\p{N}]/u.test(token)).length;
}

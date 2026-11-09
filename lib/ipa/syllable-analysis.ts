export type IpaSyllableStress = "primary" | "secondary" | "unstressed" | "not_marked";

export type IpaSyllableVariant = {
  ipa: string;
  syllableCount: number | null;
  syllableClass: "mono" | "di" | "tri" | "poly" | null;
  syllables: Array<{ ipa: string; stress: IpaSyllableStress }>;
  status: "parsed" | "needs_syllable_boundaries";
};

export type IpaSyllableAnalysis = {
  version: 1;
  source: "ipa_syllable_and_stress_marks";
  status: "parsed" | "needs_syllable_boundaries";
  variants: IpaSyllableVariant[];
};

function syllableClass(count: number): IpaSyllableVariant["syllableClass"] {
  if (count === 1) return "mono";
  if (count === 2) return "di";
  if (count === 3) return "tri";
  return "poly";
}

/** Parses Cambridge-style IPA variants, syllable dots, and stress marks. */
export function parseIpaSyllableAnalysis(ipaInput: string): IpaSyllableAnalysis {
  const variants = ipaInput
    .split(/\s+(?:or|also)\s+/i)
    .map(value => value.trim().replace(/^\(+|\)+$/g, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  const parsedVariants: IpaSyllableVariant[] = variants.map(ipa => {
    const hasSyllableDots = ipa.includes(".");
    const stressCount = ipa.match(/[ˈˌ]/gu)?.length ?? 0;
    const segments = ipa.split(".").flatMap(segment => segment.split(/(?=[ˈˌ])/u)).map(segment => segment.trim());
    if (segments.some(segment => !segment)) {
      return { ipa, syllableCount: null, syllableClass: null, syllables: [], status: "needs_syllable_boundaries" };
    }

    // A lone initial stress mark or a trailing unstressed schwa can conceal
    // additional syllables when the transcription has no explicit dots.
    if (!hasSyllableDots && stressCount > 0 && (
      ((ipa.startsWith("ˈ") || ipa.startsWith("ˌ")) && stressCount === 1)
      || /[ˈˌ].*ə$/u.test(ipa)
    )) {
      return { ipa, syllableCount: null, syllableClass: null, syllables: [], status: "needs_syllable_boundaries" };
    }

    const syllables = segments.map(segment => {
      const stress: IpaSyllableStress = segment.startsWith("ˈ")
        ? "primary"
        : segment.startsWith("ˌ")
          ? "secondary"
          : segments.length === 1
            ? "not_marked"
            : "unstressed";
      return { ipa: segment.replace(/^[ˈˌ]/u, ""), stress };
    });
    return {
      ipa,
      syllableCount: syllables.length,
      syllableClass: syllableClass(syllables.length),
      syllables,
      status: "parsed",
    };
  });

  const status = parsedVariants.length > 0 && parsedVariants.every(variant => variant.status === "parsed")
    ? "parsed"
    : "needs_syllable_boundaries";
  return { version: 1, source: "ipa_syllable_and_stress_marks", status, variants: parsedVariants };
}

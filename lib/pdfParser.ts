export type ParsedPdfPage = {
  pageNumber: number;
  rawText: string;
  title: string;
  sectionLabel: string | null;
};

const SECTION_KEYWORDS = [
  "WARM-UP",
  "DEBRIEF",
  "VOCABULARY",
  "GRAMMAR",
  "LISTENING",
  "PRE-LISTEN",
  "POST-LISTEN",
  "DISCUSSION",
  "WRITING",
  "HOMEWORK",
  "ANSWERS",
  "COMPREHENSION",
  "PRACTICE",
  "ACTIVITY",
  "FUNCTIONAL"
];

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferTitle(rawText: string, pageNumber: number) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const heading = lines.find((line) => line.length >= 4 && line.length <= 90 && !/^\d+$/.test(line));
  return heading ?? `Slide ${pageNumber}`;
}

function inferSectionLabel(rawText: string) {
  const upper = rawText.toUpperCase();
  const match = SECTION_KEYWORDS.find((keyword) => upper.includes(keyword));
  return match ?? null;
}

export async function parsePdfPages(buffer: Buffer): Promise<ParsedPdfPage[]> {
  const pdfParse = (await import("pdf-parse")).default;
  const pageTexts: string[] = [];

  await pdfParse(buffer, {
    async pagerender(pageData: unknown) {
      const page = pageData as {
        getTextContent: (options?: Record<string, unknown>) => Promise<{ items: Array<{ str: string }> }>;
      };
      const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const text = content.items.map((item) => item.str).join("\n");
      pageTexts.push(normalizeText(text));
      return text;
    }
  });

  return pageTexts.map((rawText, index) => ({
    pageNumber: index + 1,
    rawText,
    title: inferTitle(rawText, index + 1),
    sectionLabel: inferSectionLabel(rawText)
  }));
}

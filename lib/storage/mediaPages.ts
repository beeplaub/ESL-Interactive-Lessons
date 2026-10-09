export const MEDIA_PAGE_SIZE = 60;

export function parseMediaPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function mediaSearchExpression(value: string) {
  // PostgREST uses commas and parentheses as expression syntax. Treat those
  // characters as ordinary search text by removing them from the expression.
  const term = value.trim().replace(/[(),]/g, " ").replace(/\\/g, " ").replace(/\s+/g, " ");
  return term ? ["title", "caption", "alt_text", "file_name", "lesson_title", "url"].map((column) => `${column}.ilike.%${term}%`).join(",") : "";
}

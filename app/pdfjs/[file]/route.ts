import { readFile } from "fs/promises";
import path from "path";
import { notFound } from "next/navigation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (file !== "pdf.js") notFound();

  const filePath = path.join(process.cwd(), "node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
  const source = await readFile(filePath);

  return new Response(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}

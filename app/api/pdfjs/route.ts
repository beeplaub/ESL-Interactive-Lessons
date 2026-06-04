import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    const source = await readFile(filePath);

    return new Response(source, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "PDF renderer file could not be loaded.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

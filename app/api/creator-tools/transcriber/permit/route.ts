import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { creatorAccessError, getCreatorStaffAccess } from "@/lib/ai/creatorAccess";

export const runtime = "nodejs";

const TOKEN_LIFETIME_SECONDS = 120;

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}

function makePermit(userId: string, role: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    role,
    aud: "brenup-kokoro-stt",
    scope: "transcribe",
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    jti: randomUUID(),
  })).toString("base64url");
  const signingKey = createHmac("sha256", secret).update("brenup-kokoro-stt-permit-v1").digest();
  const signed = `v1.${payload}`;
  const signature = createHmac("sha256", signingKey).update(signed).digest("base64url");
  return `${signed}.${signature}`;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStoreJson({ error: "This request could not be verified." }, 403);
  }

  let access;
  try {
    access = await getCreatorStaffAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return noStoreJson({ error: known?.message ?? "Could not verify Creator Tools access." }, known?.status ?? 500);
  }

  const baseUrl = process.env.KOKORO_TTS_URL?.trim().replace(/\/$/, "");
  const serviceKey = process.env.KOKORO_TTS_API_KEY;
  if (!baseUrl || !serviceKey) {
    return noStoreJson({ error: "The local transcription service is not configured yet." }, 503);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl}/v1/audio/transcriptions`);
    if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
      return noStoreJson({ error: "The local transcription service URL must use HTTPS." }, 503);
    }
  } catch {
    return noStoreJson({ error: "The local transcription service URL is invalid." }, 503);
  }

  return noStoreJson({
    endpoint: endpoint.toString(),
    permit: makePermit(access.user.id, access.profile.role, serviceKey),
    expiresInSeconds: TOKEN_LIFETIME_SECONDS,
  });
}

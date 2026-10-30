import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";

const stunServer: RTCIceServer = { urls: "stun:stun.cloudflare.com:3478" };
const cloudflareResponseSchema = z.object({
  iceServers: z.array(
    z.object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supportRequested = new URL(request.url).searchParams.get("adminSupport") === "1";
  const access = await roomAccess(id, true, supportRequested);
  if (access.error) return access.error;

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken)
    return NextResponse.json(
      { iceServers: [stunServer], relayAvailable: false },
      { headers: { "Cache-Control": "no-store" } },
    );

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 14400 }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      return NextResponse.json(
        { error: "TURN relay credentials are temporarily unavailable." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );

    const parsed = cloudflareResponseSchema.safeParse(await response.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "TURN relay returned an invalid response." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );

    const iceServers: RTCIceServer[] = parsed.data.iceServers.map(
      ({ urls, username, credential }) => ({
        urls,
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {}),
      }),
    );
    if (!iceServers.some((server) => server.username && server.credential))
      return NextResponse.json(
        { error: "TURN relay returned no usable credentials." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );

    return NextResponse.json(
      { iceServers, relayAvailable: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "TURN relay credentials are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

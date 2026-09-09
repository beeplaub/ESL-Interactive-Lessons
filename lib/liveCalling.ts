import "server-only";
import { createHash, sign } from "node:crypto";

export function liveCallingEnabled(_classId?: string) {
  return process.env.LIVE_CALLING_ENABLED !== "false" && Boolean(process.env.JAAS_APP_ID && process.env.JAAS_KEY_ID && process.env.JAAS_PRIVATE_KEY);
}

export function createLiveCallToken(sessionId: string, userId: string, teacher: boolean) {
  if (!liveCallingEnabled()) throw new Error("Calling is not configured");
  const appId = process.env.JAAS_APP_ID!;
  if (!/^vpaas-magic-cookie-[a-zA-Z0-9]+$/.test(appId)) throw new Error("Invalid calling configuration");
  const room = `brenup${createHash("sha256").update(sessionId).digest("hex").slice(0, 32)}`;
  const participant = createHash("sha256").update(`${appId}:${userId}`).digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: process.env.JAAS_KEY_ID });
  const payload = encode({
    aud: "jitsi", iss: "chat", sub: appId, room, nbf: now - 10, exp: now + 600,
    context: {
      room: { regex: false },
      user: { id: participant, name: teacher ? "Teacher" : `Learner ${participant.slice(0, 4)}`, moderator: teacher ? "true" : "false" },
      features: { recording: false, livestreaming: false, transcription: false, "sip-inbound-call": false, "sip-outbound-call": false, "inbound-call": false, "outbound-call": false, "file-upload": false },
    },
  });
  const unsigned = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), process.env.JAAS_PRIVATE_KEY!.replace(/\\n/g, "\n")).toString("base64url");
  return { appId, roomName: `${appId}/${room}`, jwt: `${unsigned}.${signature}` };
}

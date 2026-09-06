import { callGemini } from "@/lib/ai/gemini";
import { reelContentSchema, reelTopicSchema } from "@/lib/reels";
import { reelAccess, reelBody, reelEngineStatus, reelError, ReelHttpError } from "@/lib/reels-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { user, profile } = await reelAccess();
    const input = reelTopicSchema.safeParse(await reelBody(request));
    if (!input.success) throw new ReelHttpError("Enter a genre and a topic of 3–250 characters.");
    const engine = await reelEngineStatus();
    if (!engine.available || !engine.ollama) throw new ReelHttpError(engine.message, 503);
    const content = await callGemini({
      templateKey: "creator_reel_script", variables: input.data, fallbackModel: "qwen2.5:7b",
      context: { userId: user.id, userRole: profile.role, provider: "ollama", featureKey: "creator_reels", cache: { ttlSeconds: 86400 } },
      localReelOnly: true,
      validateResponse: (value) => reelContentSchema.parse(value),
    });
    return Response.json({ script: { ...content, ...input.data } });
  } catch (error) { return reelError(error); }
}

import { z } from "zod";

export type RichText = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | null>;
  marks?: Array<{
    type: string;
    attrs?: Record<string, string | number | null>;
  }>;
  content?: RichText[];
};
export type BoardObject = {
  id: string;
  kind:
    | "pen"
    | "highlighter"
    | "text"
    | "rectangle"
    | "ellipse"
    | "line"
    | "arrow"
    | "triangle"
    | "diamond"
    | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  stroke: number;
  points?: Array<[number, number]>;
  document?: RichText;
  assetId?: string;
};
export type StageKind = "whiteboard" | "screen" | "camera" | "image" | "content";
export type SharedState = {
  room_id: string;
  board: BoardObject[];
  board_revision: number;
  stage: StageKind;
  asset_id: string | null;
  media_page: number;
  presenter_id: string | null;
  presenter_session: string | null;
  lease_until: string | null;
  revision: number;
};
export type LiveAsset = {
  id: string;
  owner_id: string;
  name: string;
  width: number;
  height: number;
  created_at: string;
};
/** Pointer position normalized to the displayed media content, not the stage viewport. */
export type LiveMediaPointer = {
  assetId: string;
  page: number | null;
  point: [number, number];
};
export type LivePerson = {
  userId: string;
  sessionId: string;
  name: string;
  role: "CREATOR" | "LEARNER" | "SUPPORT";
  joinedAt: number;
  mic: boolean;
  recordingStartedAt?: number | null;
};
export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 700;
export const emptyDocument: RichText = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export const emptyState = (roomId: string): SharedState => ({
  room_id: roomId,
  board: [],
  board_revision: 0,
  stage: "whiteboard",
  asset_id: null,
  media_page: 1,
  presenter_id: null,
  presenter_session: null,
  lease_until: null,
  revision: 0,
});
const finite = z.number().finite();
const textNode: z.ZodType<RichText> = z.lazy(() =>
  z.object({
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "hardBreak",
      "bulletList",
      "orderedList",
      "listItem",
    ]),
    text: z.string().max(10000).optional(),
    attrs: z
      .object({
        textAlign: z.enum(["left", "center", "right"]).optional(),
        start: z.number().int().min(1).max(1000).optional(),
      })
      .optional(),
    marks: z
      .array(
        z.object({
          type: z.enum(["bold", "italic", "underline", "textStyle"]),
          attrs: z
            .object({
              color: z
                .string()
                .regex(/^#[\da-f]{6}$/i)
                .nullable()
                .optional(),
              fontSize: z.number().min(12).max(120).nullable().optional(),
            })
            .optional(),
        }),
      )
      .max(4)
      .optional(),
    content: z.array(textNode).max(500).optional(),
  }),
);
export const boardSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      kind: z.enum([
        "pen",
        "highlighter",
        "text",
        "rectangle",
        "ellipse",
        "line",
        "arrow",
        "triangle",
        "diamond",
        "image",
      ]),
      x: finite.min(-1200).max(2400),
      y: finite.min(-700).max(1400),
      w: finite.min(1).max(2400),
      h: finite.min(1).max(1400),
      color: z.string().regex(/^#[\da-f]{6}$/i),
      stroke: finite.min(1).max(40),
      points: z
        .array(
          z.tuple([finite.min(-2400).max(3600), finite.min(-1400).max(2100)]),
        )
        .max(3000)
        .optional(),
      document: textNode.optional(),
      assetId: z.string().uuid().optional(),
    }),
  )
  .max(500);
export function uniquePeople(entries: LivePerson[]): LivePerson[] {
  const byUser = new Map<string, LivePerson>();
  for (const person of entries) {
    if (!person.userId || !person.sessionId) continue;
    const previous = byUser.get(person.userId);
    if (
      !previous ||
      person.joinedAt > previous.joinedAt ||
      (person.joinedAt === previous.joinedAt &&
        person.sessionId > previous.sessionId)
    )
      byUser.set(person.userId, person);
  }
  return [...byUser.values()].sort(
    (a, b) =>
      Number(b.role === "CREATOR") - Number(a.role === "CREATOR") ||
      a.name.localeCompare(b.name),
  );
}

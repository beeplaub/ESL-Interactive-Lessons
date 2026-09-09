import { z } from "zod";

export const BOARD_WIDTH = 1100;
export const BOARD_HEIGHT = 850;
export const boardObjectSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["text", "sticky", "card", "rect", "ellipse", "arrow", "pen", "highlighter", "image"]),
  x: z.number().min(-1100).max(2200), y: z.number().min(-850).max(1700),
  w: z.number().min(1).max(2200), h: z.number().min(1).max(1700),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().max(2000).optional(),
  size: z.number().min(10).max(100).optional(),
  dashed: z.boolean().optional(),
  points: z.array(z.tuple([z.number().min(-2200).max(2200), z.number().min(-1700).max(1700)])).max(1500).optional(),
  src: z.string().max(150000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  revision: z.number().int().nonnegative(),
}).strict();
export type BoardObject = z.infer<typeof boardObjectSchema>;
export type BoardSettings = { editing: boolean; prompt: string; timerEnd: number | null; timerSeconds: number; view: "board" | "lesson"; slide: number };
export type BoardDocument = { objects: Record<string, BoardObject>; settings: BoardSettings; revision: number };
export type BoardData = BoardDocument & { userId: string; teacher: boolean; live: boolean; name: string };
export const boardSettingsSchema = z.object({ editing: z.boolean().optional(), prompt: z.string().max(500).optional(), timerEnd: z.number().int().positive().nullable().optional(), timerSeconds: z.number().int().min(0).max(3600).optional(), view: z.enum(["board", "lesson"]).optional(), slide: z.number().int().min(1).max(1000).optional() }).strict();
export const boardMutationSchema = z.object({
  operation: z.string().uuid(),
  changes: z.array(z.object({ id: z.string().uuid(), expected: z.number().int().nonnegative().nullable(), value: boardObjectSchema.nullable() }).strict()).max(500).optional(),
  settings: boardSettingsSchema.optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict().refine((v) => Boolean(v.changes?.length || v.settings), "No changes supplied").refine((v) => !v.changes?.some((c) => c.value && c.id !== c.value.id), "Object ID mismatch");
export type BoardMutation = z.infer<typeof boardMutationSchema>;
export const EMPTY_BOARD: BoardDocument = { objects: {}, revision: 0, settings: { editing: false, prompt: "Use the picture to make a sentence. Try to use ‘every day’!", timerEnd: null, timerSeconds: 300, view: "board", slide: 1 } };

/** An editable teaching template, never published lesson content. */
export function routineTemplate(): BoardObject[] {
  const items: BoardObject[] = [];
  function add(kind: BoardObject["kind"], x: number, y: number, w: number, h: number, text: string, color = "#28194d", size = 30) {
    items.push({ id: crypto.randomUUID(), revision: 0, kind, x, y, w, h, text, color, size });
  }
  function underline(x: number, y: number, width: number, color = "#8544ef") {
    items.push({ id: crypto.randomUUID(), revision: 0, kind: "pen", x, y, w: width, h: 8, color, points: [[0, 8], [width * .35, 0], [width * .7, 2], [width, 6]] });
  }
  add("text", 35, 30, 670, 60, "❶  Let’s fix the sentence!  ✨", "#703cf0", 34);
  underline(80, 88, 350);
  add("text", 140, 130, 720, 65, "She go to school every day.", "#211936", 42);
  add("ellipse", 202, 124, 58, 75, "", "#ff6966");
  add("text", 320, 95, 80, 55, "×", "#ff6966", 48);
  add("arrow", 215, 211, 98, 71, "", "#06aa79");
  items.push({ id: crypto.randomUUID(), revision: 0, kind: "highlighter", x: 363, y: 272, w: 62, h: 1, color: "#2ce8a7", points: [[0, 0], [62, 0]] });
  add("text", 305, 245, 690, 60, "She goes to school every day.  ✓", "#14846c", 35);
  add("sticky", 862, 58, 205, 188, "Remember:\nHe / She / It\n   +  -s  ✓", "#c6f7ed", 30);
  add("text", 35, 355, 465, 65, "❷  Words to help you", "#703cf0", 31);
  underline(75, 409, 260);
  const words = ["wake up", "have", "go", "to school", "eat", "study", "play", "watch", "every day"];
  const colors = ["#eee3ff", "#d4faeb", "#fff4ac", "#dfedff"];
  words.forEach((word, i) => add("card", 50 + (i % 3) * 145, 440 + Math.floor(i / 3) * 90, 126, 62, word, colors[i % 4], 27));
  add("text", 520, 355, 550, 65, "❸  Look and make a sentence", "#703cf0", 30);
  underline(566, 407, 260);
  add("sticky", 560, 435, 265, 203, "Your picture here\n\nChoose Image in\nBoard Tools to add\na picture prompt.", "#e7f1ff", 27);
  add("text", 850, 445, 225, 90, "↙ What is\n   he doing?", "#211936", 27);
  add("sticky", 887, 560, 175, 110, "Use the words!\nBe creative! ☺", "#fff4ac", 24);
  add("rect", 515, 694, 522, 85, "", "#ba8bff"); items[items.length - 1].dashed = true;
  ["He", "goes", "to school", "every day", "."].forEach((word, i) => add("card", 529 + i * 108, 707, i === 4 ? 60 : 101, 58, word, "#f3f0fc", 25));
  add("text", 50, 770, 520, 60, "☀  Great work today!  ♡", "#139b9b", 31);
  underline(100, 825, 260, "#139b9b");
  add("sticky", 830, 790, 220, 50, "Speak a brighter you  ♥", "#eee3ff", 19);
  return items;
}

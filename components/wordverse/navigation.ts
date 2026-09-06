import type { Position } from "./graph";

export type SceneLocation =
  | { mode: "universe"; wordId: string }
  | { mode: "cluster"; wordId: string; topicId: string }
  | { mode: "neighborhood" | "solar"; wordId: string };
export type JourneyEntry = { id: number; location: SceneLocation; origin?: Position; originScale?: number };
export type Journey = { entries: JourneyEntry[]; nextId: number };
export type JourneyAction =
  | { type: "visit"; location: SceneLocation; origin?: Position; originScale?: number }
  | { type: "return"; id: number };

export function initialJourney(wordId: string): Journey {
  return { entries: [{ id: 0, location: { mode: "universe", wordId } }], nextId: 1 };
}

export function journeyReducer(state: Journey, action: JourneyAction): Journey {
  if (action.type === "return") {
    const index = state.entries.findIndex(entry => entry.id === action.id);
    return index < 0 ? state : { ...state, entries: state.entries.slice(0, index + 1) };
  }
  const current = state.entries[state.entries.length - 1].location;
  const next = action.location;
  if (current.mode === next.mode && (next.mode === "universe" || (next.mode === "cluster" && current.mode === "cluster" ? current.topicId === next.topicId : current.wordId === next.wordId))) return state;
  // Keep the starting universe and a bounded recent trail. Each visit has its own camera bookmark.
  const entries = [...state.entries, { id: state.nextId, location: next, origin: action.origin, originScale: action.originScale }];
  if (entries.length > 32) entries.splice(1, entries.length - 32);
  return { entries, nextId: state.nextId + 1 };
}

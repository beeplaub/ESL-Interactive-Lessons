"use client";
import { useCallback, useReducer } from "react";
import { initialJourney, journeyReducer, type JourneyAction } from "./navigation";

export function useWordverseJourney(wordId: string) {
  const [journey, dispatch] = useReducer(journeyReducer, wordId, initialJourney);
  const visit = useCallback((action: Omit<Extract<JourneyAction, { type: "visit" }>, "type">) => dispatch({ type: "visit", ...action }), []);
  const returnTo = useCallback((id: number) => dispatch({ type: "return", id }), []);
  const current = journey.entries[journey.entries.length - 1];
  return { journey, current, visit, returnTo };
}

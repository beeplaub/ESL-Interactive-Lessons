import { IpaSnakesAndLaddersGame } from "@/components/games/IpaSnakesAndLaddersGame";

export default function IpaLaddersTurnCompletePreview() {
  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
        <strong>Live game preview:</strong> play a turn to see the updated result card. The result card keeps the approved design; use “Review answer” to inspect your selected answer before moving.
      </div>
      <IpaSnakesAndLaddersGame progressKey="brenup:dev-preview:ipa-snakes-turn-complete" />
    </main>
  );
}

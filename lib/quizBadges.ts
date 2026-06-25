export type QuizBadge = {
  name: string;
  minPoints: number;
  icon: string;
  gradient: string;
  text: string;
};

export const quizBadges: QuizBadge[] = [
  { name: "Bronze", minPoints: 0, icon: "Bz", gradient: "from-amber-700 to-orange-400", text: "text-amber-900" },
  { name: "Silver", minPoints: 100, icon: "Si", gradient: "from-slate-400 to-slate-200", text: "text-slate-700" },
  { name: "Gold", minPoints: 250, icon: "Au", gradient: "from-yellow-500 to-amber-200", text: "text-yellow-800" },
  { name: "Platinum", minPoints: 500, icon: "Pt", gradient: "from-cyan-500 to-slate-100", text: "text-cyan-800" },
  { name: "Diamond", minPoints: 900, icon: "Dm", gradient: "from-sky-500 to-cyan-100", text: "text-sky-800" },
  { name: "Master", minPoints: 1400, icon: "Ms", gradient: "from-violet-600 to-fuchsia-300", text: "text-violet-800" },
  { name: "Grandmaster", minPoints: 2100, icon: "Gm", gradient: "from-rose-600 to-orange-300", text: "text-rose-800" },
  { name: "Elite", minPoints: 3000, icon: "El", gradient: "from-emerald-600 to-lime-300", text: "text-emerald-800" },
  { name: "Champion", minPoints: 4200, icon: "Ch", gradient: "from-blue-700 to-indigo-300", text: "text-blue-800" },
  { name: "Legend", minPoints: 6000, icon: "Lg", gradient: "from-zinc-950 via-purple-700 to-amber-300", text: "text-zinc-900" }
];

export function getQuizBadge(points: number) {
  return [...quizBadges].reverse().find((badge) => points >= badge.minPoints) ?? quizBadges[0];
}

export function getNextQuizBadge(points: number) {
  return quizBadges.find((badge) => badge.minPoints > points) ?? null;
}

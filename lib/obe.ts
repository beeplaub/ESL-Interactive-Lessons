export type EvidenceSelection = "LATEST" | "BEST" | "FIRST";

export type EvidencePoint = {
  earnedPoints: number;
  maximumPoints: number;
  analyticalWeight: number;
  courseItemWeight: number;
  completedAt: string;
};

export type AttainmentResult = {
  attainmentPercent: number;
  coveragePercent: number;
  attained: boolean;
  attemptedWeight: number;
  availableWeight: number;
};

export type ConfidenceBand = "Emerging" | "Developing" | "Secure" | "Strong";

export function selectEvidence<T extends EvidencePoint>(
  evidence: T[],
  strategy: EvidenceSelection,
): T | null {
  if (!evidence.length) return null;
  const ordered = [...evidence].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );
  if (strategy === "FIRST") return ordered[0];
  if (strategy === "LATEST") return ordered[ordered.length - 1];
  return ordered.reduce((best, current) => {
    const bestRatio = best.maximumPoints > 0 ? best.earnedPoints / best.maximumPoints : 0;
    const currentRatio = current.maximumPoints > 0 ? current.earnedPoints / current.maximumPoints : 0;
    return currentRatio > bestRatio ? current : best;
  });
}

export function calculateAttainment({
  selectedEvidence,
  allMappedWeights,
  masteryThreshold = 70,
  minimumCoverage = 70,
}: {
  selectedEvidence: EvidencePoint[];
  allMappedWeights: number[];
  masteryThreshold?: number;
  minimumCoverage?: number;
}): AttainmentResult {
  const availableWeight = allMappedWeights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  const attemptedWeight = selectedEvidence.reduce(
    (sum, evidence) => sum + evidence.analyticalWeight * evidence.courseItemWeight,
    0,
  );
  const weightedEarned = selectedEvidence.reduce((sum, evidence) => {
    const ratio = evidence.maximumPoints > 0 ? evidence.earnedPoints / evidence.maximumPoints : 0;
    return sum + ratio * evidence.analyticalWeight * evidence.courseItemWeight;
  }, 0);
  const attainmentPercent = attemptedWeight > 0 ? (weightedEarned / attemptedWeight) * 100 : 0;
  const coveragePercent = availableWeight > 0 ? (attemptedWeight / availableWeight) * 100 : 0;
  return {
    attainmentPercent: roundPercent(attainmentPercent),
    coveragePercent: roundPercent(Math.min(100, coveragePercent)),
    attained: attainmentPercent >= masteryThreshold && coveragePercent >= minimumCoverage,
    attemptedWeight,
    availableWeight,
  };
}

export function calculateLanguageConfidence(
  evidence: Array<{ earnedPoints: number; maximumPoints: number; completedAt: string }>,
  masteryThreshold = 70,
) {
  const recent = [...evidence]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 5);
  if (!recent.length) {
    return { confidencePercent: 0, band: "Emerging" as ConfidenceBand, learned: false };
  }

  const recencyWeights = [1, 0.75, 0.56, 0.42, 0.32];
  let weightedRatio = 0;
  let totalWeight = 0;
  recent.forEach((item, index) => {
    const weight = recencyWeights[index];
    const ratio = item.maximumPoints > 0 ? item.earnedPoints / item.maximumPoints : 0;
    weightedRatio += ratio * weight;
    totalWeight += weight;
  });
  const average = totalWeight > 0 ? weightedRatio / totalWeight : 0;
  const evidenceDepth = Math.min(1, recent.length / 3);
  const confidencePercent = roundPercent(average * (0.6 + 0.4 * evidenceDepth) * 100);
  const latest = recent[0];
  const latestPercent = latest.maximumPoints > 0 ? (latest.earnedPoints / latest.maximumPoints) * 100 : 0;

  return {
    confidencePercent,
    band: confidenceBand(confidencePercent),
    learned: latestPercent >= masteryThreshold,
  };
}

export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 85) return "Strong";
  if (value >= 70) return "Secure";
  if (value >= 45) return "Developing";
  return "Emerging";
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}


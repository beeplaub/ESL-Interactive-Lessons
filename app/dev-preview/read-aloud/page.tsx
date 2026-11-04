import { ReadingPracticePlayer } from "@/components/ReadingPractice";

export default function ReadingPreviewRoute() {
  return <main style={{ maxWidth: 960, margin: "32px auto", padding: "0 20px" }}>
    <ReadingPracticePlayer config={{
      title: "How clouds travel",
      passage: "Clouds are made of tiny water drops that gather high above the ground. Warm air rises from roads, lakes, forests, and fields, carrying invisible water vapor into the sky. As the air cools, the vapor forms small drops that join together and become a cloud. Wind then moves each cloud across the sky, sometimes carrying it far from where it first formed. When many drops grow heavy, they fall as rain and return water to rivers and soil. Some clouds are thin and bright, while others are dark because they hold more water. Sunlight can pass through gaps and make their edges glow in the morning. Clouds help move water around Earth and give people clues about coming weather.",
      level: "A1",
      time_limit_seconds: null,
      pace_wpm: 100,
      recording_attempt_limit: 3,
      chunking_enabled: true,
      usage_key: "dev-preview:read-aloud",
    }} />
  </main>;
}

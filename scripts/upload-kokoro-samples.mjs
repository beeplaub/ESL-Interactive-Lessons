import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const envText = await fs.readFile(path.resolve(".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!process.env[key]) process.env[key] = value;
}

const required = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}

const sourceDirectory = process.argv[2] || "/private/tmp/brenup-kokoro-production-samples";
const voices = ["af_heart", "af_bella", "af_nova", "bf_emma", "af_sarah", "am_puck", "bm_george", "am_fenrir"];
const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const baseUrl = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");

for (const voice of voices) {
  const body = await fs.readFile(path.join(sourceDirectory, `${voice}.wav`));
  const key = `ai-recordings/voiceovers/system/kokoro-samples/${voice}.wav`;
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "audio/wav",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  console.log(`${voice} ${baseUrl}/${key}`);
}

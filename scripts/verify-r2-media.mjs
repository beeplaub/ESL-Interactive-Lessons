import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

for (const path of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), ".env")]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1).replace(/^["']|["']$/g, "");
  }
}

const required = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);

const key = `healthchecks/r2-media-${randomUUID()}.txt`;
const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestHandler: { requestTimeout: 10_000 },
});

try {
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: "BrenUp R2 media verification",
    ContentType: "text/plain",
  }));
  await client.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
  const url = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
  const response = await fetch(url, { method: "HEAD" });
  console.log(`R2 upload/head: ok`);
  console.log(`Public media domain: ${response.status}${response.ok ? " ok" : " not reachable"}`);
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
}

let removed = false;
try {
  await client.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
} catch (error) {
  removed = error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound";
}
console.log(`R2 delete/head: ${removed ? "ok" : "needs propagation check"}`);

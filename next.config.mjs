/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the dev output isolated so a concurrent `next build` cannot replace
  // development chunks while an admin is previewing an unfinished workflow.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb"
    }
  },
  outputFileTracingIncludes: {
    "/api/pdfjs": ["./node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js"],
    "/api/pdfjs-worker": ["./node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.worker.js"],
    "/pdfjs/[file]": ["./node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js"]
  }
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
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

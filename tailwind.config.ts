import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        moss: "#2563eb",
        coral: "#f97316",
        skywash: "#eff6ff"
      }
    }
  },
  plugins: []
};

export default config;

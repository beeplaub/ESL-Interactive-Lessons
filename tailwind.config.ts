import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        moss: "#2563eb",
        coral: "#f97316",
        skywash: "#eff6ff",
        midnight: "#06152f",
        violetglow: "#7c3aed",
        electric: "#2563ff",
        mint: "#12b981",
        gold: "#f59e0b"
      }
    }
  },
  plugins: []
};

export default config;

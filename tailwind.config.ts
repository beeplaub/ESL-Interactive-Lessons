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
        gold: "#f59e0b",
        brand: "var(--br-brand)",
        action: "var(--br-action)",
        canvas: "var(--br-canvas)",
        surface: "var(--br-surface)",
        muted: "var(--br-text-muted)",
        success: "var(--br-success)",
        danger: "var(--br-danger)"
      }
    }
  },
  plugins: []
};

export default config;

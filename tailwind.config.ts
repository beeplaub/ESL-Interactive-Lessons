import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic names are the supported public design contract.
        strong: "var(--br-text)",
        "on-dark": "var(--br-text-on-dark)",
        dark: "var(--br-dark-card)",
        "dark-raised": "var(--br-dark-card-raised)",
        info: "var(--br-info)",
        warning: "var(--br-warning)",
        achievement: "var(--br-achievement)",
        "surface-muted": "var(--br-surface-muted)",
        "surface-strong": "var(--br-surface-strong)",
        "border-strong": "var(--br-border-strong)",
        // Compatibility aliases. New components must use the semantic names above.
        ink: "var(--br-text)",
        moss: "var(--br-info)",
        coral: "var(--br-action)",
        skywash: "var(--br-surface-muted)",
        midnight: "var(--br-dark-card)",
        violetglow: "var(--br-chart-primary)",
        electric: "var(--br-info)",
        mint: "var(--br-success)",
        gold: "var(--br-achievement)",
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

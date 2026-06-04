import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        moss: "#5f7f64",
        coral: "#d96c4f",
        skywash: "#edf7f8"
      }
    }
  },
  plugins: []
};

export default config;

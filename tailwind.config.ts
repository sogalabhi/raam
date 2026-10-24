import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F5F1",
        surface: "#FFFFFF",
        subtle: "#EFEDE7",
        ink: "#15171A",
        muted: "#5E636B",
        hair: "#DAD7CF",
        petrol: { DEFAULT: "#0E5E63", soft: "#E3EEEE", deep: "#0A4649" },
        champagne: { DEFAULT: "#B08D57", soft: "#F3ECE0" },
        amber: { DEFAULT: "#C98A12", soft: "#F8EEDB" },
        oxblood: { DEFAULT: "#A3302A", soft: "#F5E4E2" },
        silver: { light: "#E9EAEC", dark: "#B9BDC3" },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"Inter Tight"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)",
        float: "0 1px 2px rgba(0,0,0,.05), 0 18px 48px rgba(0,0,0,.12)",
      },
      borderRadius: { card: "16px" },
      letterSpacing: { label: "0.12em" },
    },
  },
  plugins: [],
} satisfies Config;

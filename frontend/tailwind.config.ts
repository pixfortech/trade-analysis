import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    // Include lib/hooks so any utility-class strings defined there are scanned
    // (a missing glob here purged dynamic grid classes and broke the layout).
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium dark trading palette
        base: {
          950: "#0a0e17",
          900: "#0d1320",
          850: "#111827",
          800: "#151c2c",
          700: "#1c2536",
          600: "#26314a",
        },
        bull: {
          DEFAULT: "#16c784",
          soft: "rgba(22, 199, 132, 0.12)",
        },
        bear: {
          DEFAULT: "#ea3943",
          soft: "rgba(234, 57, 67, 0.12)",
        },
        neutralSignal: {
          DEFAULT: "#f0b90b",
          soft: "rgba(240, 185, 11, 0.12)",
        },
        accent: {
          DEFAULT: "#3b82f6",
          soft: "rgba(59, 130, 246, 0.12)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;

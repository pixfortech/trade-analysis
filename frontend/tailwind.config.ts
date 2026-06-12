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
        // Action colours aligned to the Claude Design tokens (enter / exit /
        // wait / avoid). Single balanced values that read on the dark navy
        // surfaces and the light theme alike.
        bull: {
          DEFAULT: "#12b76a",
          soft: "rgba(18, 183, 106, 0.14)",
        },
        bear: {
          DEFAULT: "#f04438",
          soft: "rgba(240, 68, 56, 0.14)",
        },
        neutralSignal: {
          DEFAULT: "#f79009",
          soft: "rgba(247, 144, 9, 0.14)",
        },
        accent: {
          DEFAULT: "#5b82ee",
          soft: "rgba(91, 130, 238, 0.14)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Cards use rounded-xl throughout; bump to the design's 14px card
        // radius (Tailwind's default xl is 12px).
        xl: "0.875rem",
      },
      boxShadow: {
        // Cool navy-tinted elevation (design shadow), not neutral black.
        card: "0 1px 2px rgba(9, 13, 22, 0.4), 0 8px 24px rgba(9, 13, 22, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;

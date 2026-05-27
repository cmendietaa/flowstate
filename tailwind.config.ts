import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18201d",
        mist: "#f4f6f3",
        line: "#dfe5dd",
        moss: "#567568",
        coral: "#d66f5f",
        gold: "#c99a2e",
        sky: "#5e8fbf"
      },
      boxShadow: {
        soft: "0 14px 40px rgba(24, 32, 29, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#F5C65A",   // golden – buttons, active nav accent ONLY
          dark:    "#C9A24A",   // darker gold – hover state
          light:   "#EDE5D0",   // warm cream – sidebar bg
          cream:   "#F7F2E8",   // ivory – page bg
        },
        brown: {
          DEFAULT: "#3A3520",   // near-black warm – headings & primary text
          light:   "#7A7050",   // muted warm – secondary text
        },
      },
    },
  },
  plugins: [],
};

export default config;

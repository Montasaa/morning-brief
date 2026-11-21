// The Reels look's one sans typeface (spec #6): Inter, with IBM Plex Sans
// Arabic for Arabic. Self-hosted at build time from the @fontsource packages in
// package.json, through next/font/local: no request ever leaves for a font
// service, at build or at run time. globals.css builds the font stack from the
// two CSS variables.
import localFont from "next/font/local";

/** Inter, variable weight (400–800 are used), Latin. Preloaded: every screen uses it. */
export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

/** IBM Plex Sans Arabic 400–700, Arabic letters only (Latin falls back to Inter). Loaded when Arabic text is on screen. */
export const plexArabic = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: "700" },
  ],
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-plex-arabic",
});

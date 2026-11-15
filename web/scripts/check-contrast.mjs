// Checks the Reels look's accent colours for contrast (spec #6, rework ticket 07).
//
//   node scripts/check-contrast.mjs
//
// Reads every accent's two values from src/app/globals.css (--acc-dark for the
// Brief canvas and dark chrome, --acc-light for light chrome) and checks each,
// with WCAG 2 contrast ratios, against every background it can sit on: at least
// 4.5:1, since an accent colours text (links, the why-line, countdowns). Also
// checks the text drawn on a filled accent (--on-acc) and the muted text tokens.
// Exits 1 if anything is short. Run it after changing a colour token, and copy
// the table into DEVELOPING.md › Display.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT = 4.5;
// Backgrounds, as in globals.css: dark (canvas --bg, --canvas, --surf, --surf2;
// dark chrome uses the same family) and light chrome (--bg, --surf, --surf2).
const DARK_BACKGROUNDS = ["#000000", "#060607", "#121315", "#1b1d20"];
const LIGHT_BACKGROUNDS = ["#ffffff", "#f4f5f7", "#eceef1"];
const ON_ACC_DARK = "#000000";
const ON_ACC_LIGHT = "#ffffff";
const MUTED = [
  ["light chrome --mute", "#5d646d", LIGHT_BACKGROUNDS],
  ["dark chrome --mute", "#8b9098", DARK_BACKGROUNDS],
];

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "globals.css"), "utf8");

/** { accent: { dark, light } } from blocks like `[data-accent="sky"] { --acc-dark: #..; --acc-light: #..; }`. */
function accents() {
  const found = {};
  for (const m of css.matchAll(/((?::root,\s*)?\[data-accent="(\w+)"\])\s*\{([^}]*)\}/g)) {
    const dark = /--acc-dark:\s*(#[0-9a-f]{6})/i.exec(m[3])?.[1];
    const light = /--acc-light:\s*(#[0-9a-f]{6})/i.exec(m[3])?.[1];
    if (!dark || !light) throw new Error(`accent "${m[2]}" needs both --acc-dark and --acc-light as #rrggbb`);
    found[m[2]] = { dark, light };
  }
  return found;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const worst = (fg, backgrounds) => Math.min(...backgrounds.map((bg) => ratio(fg, bg)));
const fmt = (n) => `${n.toFixed(2)}:1`;

let failed = false;
const rows = [];
for (const [name, { dark, light }] of Object.entries(accents())) {
  const checks = [worst(dark, DARK_BACKGROUNDS), ratio(ON_ACC_DARK, dark), worst(light, LIGHT_BACKGROUNDS), ratio(ON_ACC_LIGHT, light)];
  if (checks.some((c) => c < TEXT)) failed = true;
  rows.push(`| ${name} | \`${dark}\` | ${fmt(checks[0])} | ${fmt(checks[1])} | \`${light}\` | ${fmt(checks[2])} | ${fmt(checks[3])} |`);
}

console.log("| Accent | Dark value | Worst on dark | Black on it | Light-chrome value | Worst on light | White on it |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
console.log(rows.join("\n"));
for (const [label, fg, backgrounds] of MUTED) {
  const r = worst(fg, backgrounds);
  if (r < TEXT) failed = true;
  console.log(`${label} ${fg}: ${fmt(r)} at worst`);
}
if (failed) {
  console.error(`\nSome colour is under ${TEXT}:1 against a background it sits on.`);
  process.exit(1);
}
console.log(`\nEvery value is at least ${TEXT}:1 against every background it sits on.`);

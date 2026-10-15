// Draws the icon set as SVG and renders PNGs into assets/icons/ (see docs/DESIGN.md "Icons").
// Run: node scripts/icons.mjs   (the PNGs are committed; the build copies them into dist/icons/)
import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets/icons");

const PAPER = "#F3F4F1";
const INK = "#1D2126";
// Toolbar colours sit between the light and dark palettes so the mark reads on light and dark toolbars.
const COLOURS = { keep: "#2B8A73", restart: "#B07A12", clean: "#6B737B", none: "#7D8389" };
const GREY = { keep: "#5E6368", restart: "#7A7F84", clean: "#8E9398", none: "#9A9FA4" };

/** The status mark on a 32-unit grid: a square that is full, half full, struck through, or dotted. */
export function statusSvg(status, palette) {
  const c = palette[status];
  const frame = `<rect x="5" y="5" width="22" height="22" rx="2.5" fill="${PAPER}" stroke="${c}" stroke-width="3"${status === "none" ? ' stroke-dasharray="3.2 3"' : ""}/>`;
  const fill =
    status === "keep" ? `<rect x="5" y="5" width="22" height="22" rx="2.5" fill="${c}"/>` :
    status === "restart" ? `<path d="M5 16 H27 V24.5 a2.5 2.5 0 0 1 -2.5 2.5 H7.5 a2.5 2.5 0 0 1 -2.5 -2.5 Z" fill="${c}"/>` :
    status === "clean" ? `<path d="M8.5 23.5 L23.5 8.5" stroke="${c}" stroke-width="3" stroke-linecap="round"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${frame}${fill}</svg>`;
}

/** Product icon: a dark slate with one diagonal wipe (artwork inside 96 of 128 units, 16 units padding). */
export function brandSvg(grey = false) {
  const slate = grey ? "#6E7378" : INK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="16" y="16" width="96" height="96" rx="14" fill="${slate}"/>
  <path d="M30 98 L98 30" stroke="${PAPER}" stroke-width="18" stroke-linecap="round" opacity="0.92"/>
</svg>`;
}

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

await mkdir(out, { recursive: true });
for (const status of ["keep", "restart", "clean", "none"]) {
  for (const size of [16, 32]) {
    await writeFile(path.join(out, `status-${status}-${size}.png`), png(statusSvg(status, COLOURS), size));
    await writeFile(path.join(out, `status-${status}-off-${size}.png`), png(statusSvg(status, GREY), size));
  }
  await writeFile(path.join(out, `status-${status}.svg`), statusSvg(status, COLOURS));
}
for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(out, `icon-${size}.png`), png(brandSvg(), size));
  await writeFile(path.join(out, `icon-off-${size}.png`), png(brandSvg(true), size));
}
await writeFile(path.join(out, "icon.svg"), brandSvg());
console.log("Icons written to assets/icons/");

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "../../src/ui/tokens.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}
const light = tokens(css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("@media (prefers-reduced-motion"))) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("Design tokens (ACC-04 automated part)", () => {
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    it(`${name}: every text colour meets WCAG AA (4.5:1) on paper and on raised paper`, () => {
      for (const fg of ["ink", "keep", "restart", "clean", "muted", "signal", "alert"]) {
        expect(contrast(t[fg]!, t.paper!), `${fg} on paper`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t[fg]!, t["paper-raised"]!), `${fg} on paper-raised`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t["signal-ink"]!, t.signal!), "primary button text").toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.ink!, t.field!), "text in fields").toBeGreaterThanOrEqual(4.5);
    });
  }
  it("light and dark are designed separately (not an inversion)", () => {
    expect(dark.paper).not.toBe(light.ink);
    expect(dark.keep).not.toBe(light.keep);
  });
});

describe("PER-04 user-facing text is not hard-coded in UI code", () => {
  const root = path.resolve(__dirname, "../../src");
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
  const files = walk(root).filter((f) => /\.(ts)$/.test(f) && /[\\/](ui|background)[\\/]/.test(f));
  it.each(files.map((f) => path.relative(root, f)))("%s has no sentence-like string literals", (rel) => {
    const code = readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // A quoted run of 2+ words starting with a capital letter reads as UI text; it must come from _locales.
    const hits = [...code.matchAll(/(["'`])([A-Z][a-z]+(?: [a-z][\w']*)+[.?]?)\1/g)].map((m) => m[2]);
    expect(hits).toEqual([]);
  });
});

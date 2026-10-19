// Builds the extension into dist/ (production) or dist-test/ (with test hooks for E2E).
// Usage: node scripts/build.mjs [--test]
import { build } from "esbuild";
import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isTest = process.argv.includes("--test");
const out = path.join(root, isTest ? "dist-test" : "dist");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: "chrome130",
  format: "iife",
  legalComments: "none",
  logLevel: "warning",
};

await build({ ...common, entryPoints: [path.join(root, "src/background/index.ts")], outfile: path.join(out, "background.js") });
for (const page of ["popup", "settings", "welcome"]) {
  await build({ ...common, entryPoints: [path.join(root, `src/ui/${page}/${page}.ts`)], outfile: path.join(out, `${page}.js`) });
  await cp(path.join(root, `src/ui/${page}/${page}.html`), path.join(out, `${page}.html`));
  await cp(path.join(root, `src/ui/${page}/${page}.css`), path.join(out, `${page}.css`));
}
await cp(path.join(root, "src/ui/tokens.css"), path.join(out, "tokens.css"));
await mkdir(path.join(out, "icons"), { recursive: true });
for (const f of await readdir(path.join(root, "assets/icons"))) {
  if (f.endsWith(".png")) await cp(path.join(root, "assets/icons", f), path.join(out, "icons", f));
}

const manifest = JSON.parse(await readFile(path.join(root, "src/manifest.json"), "utf8"));
await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
await cp(path.join(root, "src/_locales"), path.join(out, "_locales"), { recursive: true });
for (const notice of ["LICENSE", "LICENSE-THIRD-PARTY.md"]) {
  await cp(path.join(root, notice), path.join(out, notice));
}

if (isTest) {
  // Test-only page that exposes the core modules to Playwright. Never part of dist/.
  await build({ ...common, entryPoints: [path.join(root, "tests/test-hooks/hooks.ts")], outfile: path.join(out, "test-hooks.js") });
  await cp(path.join(root, "tests/test-hooks/hooks.html"), path.join(out, "test-hooks.html"));
}
console.log(`Built ${path.relative(root, out)}/`);

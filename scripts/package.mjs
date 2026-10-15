// Builds the store zip from a fresh production build: release/crumble-<version>.zip.
// The zip holds only what dist/ contains (no source maps, tests, fixtures or test hooks).
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [path.join(root, "scripts/build.mjs")], { stdio: "inherit" });
const dist = path.join(root, "dist");

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = {};
for (const f of await walk(dist)) {
  const rel = path.relative(dist, f).split(path.sep).join("/");
  if (/\.map$|test-hooks|\.spec\.|fixtures\//.test(rel)) throw new Error(`Refusing to package ${rel}`);
  files[rel] = new Uint8Array(await readFile(f));
}
const { version } = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
await mkdir(path.join(root, "release"), { recursive: true });
const out = path.join(root, "release", `crumble-${version}.zip`);
await writeFile(out, zipSync(files, { level: 9 }));
console.log(`Packaged ${Object.keys(files).length} files into ${path.relative(root, out)}`);

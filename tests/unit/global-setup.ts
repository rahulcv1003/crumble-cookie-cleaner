import { execFileSync } from "node:child_process";

/** PER-* tests read the production build, so build dist/ once before the unit run. */
export default function setup(): void {
  execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
}

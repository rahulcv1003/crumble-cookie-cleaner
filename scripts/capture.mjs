// Cross-platform screenshot commands: no shell-specific environment syntax.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kind = process.argv[2];
if (!["screenshots", "store-assets"].includes(kind)) throw new Error("Choose screenshots or store-assets");
execFileSync(process.execPath, ["scripts/build.mjs", "--test"], { stdio: "inherit" });
execFileSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", `tests/e2e/${kind}.spec.ts`], {
  stdio: "inherit",
  env: { ...process.env, SCREENSHOTS: "1" },
});

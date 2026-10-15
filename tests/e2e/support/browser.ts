/**
 * Launching Playwright's bundled Chromium with the extension, following the
 * spike harness (tests/harness/lib.js) and the PRD "Test environment":
 *  - persistent context in a fresh temporary profile, never the user's Chrome;
 *  - --host-resolver-rules maps *.test to 127.0.0.1, --no-proxy-server, --ignore-certificate-errors;
 *  - Playwright's default --disable-features list minus ThirdPartyStoragePartitioning,
 *    so storage partitioning matches real Chrome;
 *  - third-party cookies explicitly allowed in the profile;
 *  - restart tests use installAsPersistent(): the extension becomes a normal
 *    unpacked install (location 4) so onStartup fires and alarms survive.
 */
import { chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(HERE, "../../..");
export const DIST_TEST = path.join(ROOT, "dist-test");

function playwrightDisableFeaturesArg(): string {
  const switchesPath = path.join(path.dirname(require.resolve("playwright-core/package.json")), "lib/server/chromium/chromiumSwitches.js");
  const { chromiumSwitches } = require(switchesPath) as { chromiumSwitches: (assistantMode?: boolean) => string[] };
  const arg = chromiumSwitches(false).find((a) => a.startsWith("--disable-features="));
  if (!arg) throw new Error("Could not find Playwright's --disable-features switch");
  return arg;
}

function ourDisableFeaturesArg(): string {
  const list = playwrightDisableFeaturesArg()
    .replace("--disable-features=", "")
    .split(",")
    .filter((f) => f && f !== "ThirdPartyStoragePartitioning");
  return `--disable-features=${list.join(",")}`;
}

export function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `crumble-${prefix}-`));
}

/** Copies dist-test/ to a temp folder so a test can change the installed files (for example the version). */
export function copyExtension(): string {
  const dir = tempDir("ext");
  fs.cpSync(DIST_TEST, dir, { recursive: true });
  return dir;
}

function readPrefs(profileDir: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(path.join(profileDir, "Default", "Preferences"), "utf8"));
  } catch {
    return {};
  }
}
function writePrefs(profileDir: string, prefs: Record<string, any>): void {
  fs.mkdirSync(path.join(profileDir, "Default"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "Default", "Preferences"), JSON.stringify(prefs));
}

function setThirdPartyCookies(profileDir: string, allow: boolean): void {
  const prefs = readPrefs(profileDir);
  prefs.profile = { ...(prefs.profile ?? {}), cookie_controls_mode: allow ? 0 : 1, block_third_party_cookies: !allow };
  writePrefs(profileDir, prefs);
}

export type Launched = { ctx: BrowserContext; extId: string; sw: Worker | undefined; hooks: () => Promise<Page> };

/**
 * Launches the browser. With loadExtension (default) the extension at extPath is loaded
 * with --load-extension; without it, the profile must already contain a persistent install.
 */
export async function launch(
  profileDir: string,
  extPath: string,
  opts: { loadExtension?: boolean; extId?: string; restoreLastSession?: boolean; blockThirdPartyCookies?: boolean } = {},
): Promise<Launched> {
  const loadExtension = opts.loadExtension ?? true;
  setThirdPartyCookies(profileDir, !opts.blockThirdPartyCookies);
  if (opts.restoreLastSession) {
    // "Continue where you left off", and no about:blank start page from Playwright,
    // so Chrome restores the tabs that were open when it closed.
    const prefs = readPrefs(profileDir);
    prefs.session = { ...(prefs.session ?? {}), restore_on_startup: 1 };
    writePrefs(profileDir, prefs);
  }
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions", playwrightDisableFeaturesArg(), ...(opts.restoreLastSession ? ["about:blank"] : [])],
    args: [
      ...(loadExtension ? [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`] : []),
      "--host-resolver-rules=MAP *.test 127.0.0.1",
      "--ignore-certificate-errors",
      "--no-proxy-server",
      ourDisableFeaturesArg(),
    ],
    ignoreHTTPSErrors: true,
  });
  // A freshly loaded extension starts its worker (onInstalled). On a plain relaunch of a
  // persistent install, Chrome only starts the worker for an event it listens to, so the
  // caller passes the known extension id instead of waiting for a worker.
  let sw = ctx.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://"));
  if (!sw && !opts.extId) sw = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
  const extId = opts.extId ?? new URL(sw!.url()).host;
  const hooks = async () => {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/test-hooks.html`);
    await page.waitForFunction(() => "crumbleTest" in globalThis);
    return page;
  };
  return { ctx, extId, sw, hooks };
}

/**
 * Makes the extension a normal unpacked install in this profile (the spike-harness method):
 * load once with --load-extension, close, change its Preferences entry from location 8
 * (command line) to 4 (unpacked) with developer mode on. Later launches must pass
 * loadExtension: false and the returned extId, and reuse the same profile directory.
 */
export async function installAsPersistent(profileDir: string, extPath: string, opts: { allowIncognito?: boolean } = {}): Promise<string> {
  const first = await launch(profileDir, extPath);
  const extId = first.extId;
  // Let onInstalled finish writing its defaults before closing.
  const page = await first.hooks();
  for (let i = 0; i < 100; i++) {
    const got = await call<Record<string, unknown>>(page, "rawGet", ["settings"]);
    if (got.settings) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await first.ctx.close();
  const prefs = readPrefs(profileDir);
  const entry = prefs.extensions?.settings?.[extId];
  if (!entry) throw new Error(`No Preferences entry for extension ${extId}`);
  entry.location = 4;
  if (opts.allowIncognito) entry.incognito = true; // "Allow in Incognito" on chrome://extensions
  prefs.extensions.ui = { ...(prefs.extensions.ui ?? {}), developer_mode: true };
  writePrefs(profileDir, prefs);
  return extId;
}

/** Calls a method on the test-hooks page (dist-test only). */
export function call<T = unknown>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => (globalThis as any).crumbleTest[m as string](...(a as unknown[])),
    [method, args] as const,
  ) as Promise<T>;
}

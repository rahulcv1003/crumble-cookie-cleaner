/**
 * Settings and storage E2E tests. Both close and reopen the browser or reload the
 * extension, so they use a persistent (normal unpacked) install, per the PRD
 * "Test environment" restart rule.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { call, copyExtension, installAsPersistent, launch, tempDir } from "./support/browser";
import { defaultSettings, type Settings } from "../../src/core/settings";
import type { Rule } from "../../src/core/rules";

/** Every setting changed away from its default. */
function everySettingChanged(): Settings {
  const d = defaultSettings();
  const flip = <T extends Record<string, unknown>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "boolean" ? !v : v])) as T;
  return { ...flip(d), schema: 1, delaySeconds: 300, siteData: flip(d.siteData), display: flip(d.display) };
}

test("SET-02 change each setting, restart the browser: all persist", async () => {
  const profile = tempDir("set02");
  const ext = copyExtension();
  const extId = await installAsPersistent(profile, ext);

  let run = await launch(profile, ext, { loadExtension: false, extId });
  let page = await run.hooks();
  const fresh = await call<Settings>(page, "loadSettings");
  expect(fresh).toEqual(defaultSettings());

  const changed = everySettingChanged();
  const { schema: _schema, ...change } = changed;
  const saved = await call<Settings>(page, "saveSettings", change);
  expect(saved).toEqual(changed);
  const added = await call<{ added: Rule[] }>(page, "addRules", "a.test, *.b.test, /c\\.(com|net)/", "keep");
  expect(added.added).toHaveLength(3);
  await run.ctx.close();

  run = await launch(profile, ext, { loadExtension: false, extId });
  page = await run.hooks();
  expect(await call<Settings>(page, "loadSettings")).toEqual(changed);
  const raw = await call<Record<string, unknown>>(page, "rawGet", ["settings", "rules"]);
  expect(raw.settings).toEqual(changed); // stored as written, not repaired on load
  expect(raw.rules).toEqual(added.added);
  await run.ctx.close();
});

test("SET-05 extension update: rules, settings and log intact; no tab opened", async () => {
  const profile = tempDir("set05");
  const ext = copyExtension();
  const extId = await installAsPersistent(profile, ext);

  const run = await launch(profile, ext, { loadExtension: false, extId });
  const page = await run.hooks();
  expect(await call(page, "manifestVersion")).toBe("0.1.0");

  // State as an older version would have left it: settings without a schema field (pre-schema),
  // rules, and a cleanup log entry (the log itself is built in a later phase; it must survive updates).
  const changed = everySettingChanged();
  const { schema: _schema, ...oldSettings } = changed;
  const log = [{ time: 1_792_000_000_000, trigger: "tabClose", sitesCleaned: 2, cookiesDeleted: 14 }];
  await call(page, "rawSet", { settings: oldSettings, cleanupLog: log });
  const added = await call<{ added: Rule[] }>(page, "addRules", "example.com, *.github.io", "restart");
  const before = await call<Record<string, unknown>>(page, "rawGet", null);

  // Track every page opened from now on.
  const opened: string[] = [];
  run.ctx.on("page", (p) => opened.push(p.url() || "(pending)"));

  // Ship "0.1.1": change the installed files' version, then reload the extension, which
  // Chrome treats as an update (onInstalled reason "update").
  const manifestPath = path.join(ext, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = "0.1.1";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const newWorker = run.ctx.waitForEvent("serviceworker", { timeout: 15_000 });
  await page.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
  await newWorker;
  await new Promise((r) => setTimeout(r, 3000)); // give onInstalled time to run and any tab time to appear
  expect(opened, "pages opened by the update").toEqual([]);

  const after = await run.hooks();
  expect(await call(after, "manifestVersion")).toBe("0.1.1");
  const stored = await call<Record<string, unknown>>(after, "rawGet", null);
  expect(stored.settings).toEqual(changed); // migrated to schema 1 by onInstalled(update), no value lost
  expect(stored.rules).toEqual(added.added);
  expect(stored.rules).toEqual(before.rules);
  expect(stored.cleanupLog).toEqual(log);
  expect(stored.installDate).toEqual(before.installDate);
  await run.ctx.close();
});

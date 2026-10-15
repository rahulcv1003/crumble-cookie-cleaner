/** Phase C: settings page, log, import and export, site data offer. */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, sleep, visit, waitForCleanup } from "./support/helpers";
import type { Rule } from "../../src/core/rules";
import type { Settings } from "../../src/core/settings";
import type { BrowserContext, Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

async function settingsPage(ctx: BrowserContext, extId: string, hash = ""): Promise<Page> {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto(`chrome-extension://${extId}/settings.html${hash}`);
  await p.waitForSelector("#lists");
  return p;
}
const rules = (hooks: Page) => call<Rule[]>(hooks, "loadRules");
const FIXTURE = path.resolve(process.cwd(), "tests/fixtures/cad-docs-example.json");

test("STG-01 add, edit, search and delete a rule; delete asks for confirmation", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const p = await settingsPage(ctx, extId);
  await p.fill("#add-pattern", "a.com, *.b.com ,/c\\.(com|net)/");
  await p.getByRole("button", { name: "Add to list" }).click();
  await expect(p.locator("table.rules tbody tr")).toHaveCount(3);
  expect((await rules(hooks)).map((r) => r.pattern).sort()).toEqual(["*.b.com", "/c\\.(com|net)/", "a.com"]);
  // invalid regex is rejected with a message naming the problem
  await p.fill("#add-pattern", "/[a-/");
  await p.getByRole("button", { name: "Add to list" }).click();
  await expect(p.locator("#add-errors")).toContainText('"/[a-/" has a [ without a closing ]');
  expect(await rules(hooks)).toHaveLength(3);
  // edit: keep only named cookies, LocalStorage cleaned, a note
  await p.getByRole("button", { name: "Edit a.com" }).click();
  await p.getByLabel("Keep only these cookies").check();
  await p.getByLabel("Cookie names to keep").fill("sid, lang");
  await p.getByLabel("LocalStorage for this rule").selectOption("clean");
  await p.getByLabel("Note", { exact: true }).fill("Work login");
  await p.getByRole("button", { name: "Save rule" }).click();
  const a = (await rules(hooks)).find((r) => r.pattern === "a.com")!;
  expect(a).toMatchObject({ cookies: { mode: "named", names: ["sid", "lang"] }, note: "Work login" });
  expect(a.siteData.localStorage).toBe("clean");
  await expect(p.locator("#rule-" + a.id)).toContainText("Only sid, lang");
  // search
  await p.fill("#rule-search", "work");
  await expect(p.locator("table.rules tbody tr")).toHaveCount(1);
  await p.fill("#rule-search", "");
  // delete with confirmation: cancel keeps it, confirm removes it
  await p.getByRole("button", { name: "Delete *.b.com" }).click();
  await expect(p.getByRole("dialog")).toContainText("Delete the rule *.b.com?");
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(await rules(hooks)).toHaveLength(3);
  await p.getByRole("button", { name: "Delete *.b.com" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Delete rule" }).click();
  await expect.poll(async () => (await rules(hooks)).map((r) => r.pattern).sort()).toEqual(["/c\\.(com|net)/", "a.com"]);
});

test("STG-02 bulk delete 50 rules: the confirmation shows 50; all removed", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRules", Array.from({ length: 50 }, (_, i) => `site${i}.test`).join(", "), "keep");
  await call(hooks, "addRules", "keep-me.test", "restart");
  const p = await settingsPage(ctx, extId);
  await p.getByRole("radio", { name: "Keep", exact: true }).check({ force: true });
  await expect(p.locator("table.rules tbody tr")).toHaveCount(50);
  for (const box of await p.locator("table.rules tbody input[type=checkbox]").all()) await box.check();
  await p.getByRole("button", { name: "Delete selected (50)" }).click();
  await expect(p.getByRole("dialog")).toContainText("Delete 50 rules?");
  await p.getByRole("dialog").getByRole("button", { name: "Delete 50 rules" }).click();
  await expect.poll(async () => (await rules(hooks)).map((r) => r.pattern)).toEqual(["keep-me.test"]);
});

test("STG-03 every cleaning setting changed on the page takes effect without a restart", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks, { delaySeconds: 15 });
  const p = await settingsPage(ctx, extId);
  const switches = ["set-cleanOnDomainChange", "set-cleanDiscardedTabs", "set-cleanOnStartup", "set-cleanOpenTabsOnStartup", "set-keepEmbeddedOnKeptSites"];
  const before = await call<Settings>(hooks, "loadSettings");
  for (const id of switches) await p.click(`#${id}`);
  await p.fill("#set-delay", "1");
  await p.press("#set-delay", "Tab");
  await expect.poll(async () => (await call<Settings>(hooks, "loadSettings")).delaySeconds).toBe(1);
  const after = await call<Settings>(hooks, "loadSettings");
  expect(after).toMatchObject({
    cleanOnDomainChange: !before.cleanOnDomainChange,
    cleanDiscardedTabs: !before.cleanDiscardedTabs,
    cleanOnStartup: !before.cleanOnStartup,
    cleanOpenTabsOnStartup: !before.cleanOpenTabsOnStartup,
    keepEmbeddedOnKeptSites: !before.keepEmbeddedOnKeptSites,
  });
  // the dependent reload setting appears once "clean open tabs at startup" is on
  await expect(p.locator("#set-reloadAfterStartupClean")).toBeVisible();
  // behaviour: the new delay (1 s) and domain-change cleaning apply at once
  const tab = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await tab.goto("https://b.test/");
  const entry = await waitForCleanup(hooks, t, 8000);
  expect(entry.trigger).toBe("domainChange");
  // automatic cleaning off from the page: tab close then cleans nothing
  await p.click("#set-autoClean");
  await expect.poll(async () => (await call<Settings>(hooks, "loadSettings")).autoClean).toBe(false);
  const n = (await call<unknown[]>(hooks, "rawGet", ["cleanupLog"]) as any).cleanupLog.length;
  await tab.close();
  await sleep(4000);
  expect(((await call<any>(hooks, "rawGet", ["cleanupLog"])).cleanupLog as unknown[]).length).toBe(n);
  // bad delay is refused with a message and the old value kept
  await p.fill("#set-delay", "0");
  await p.press("#set-delay", "Tab");
  await expect(p.locator("#live")).toContainText("The delay must be a whole number from 1 to 3600 seconds.");
  expect((await call<Settings>(hooks, "loadSettings")).delaySeconds).toBe(1);
});

test("LOG-01 after a cleanup the log lists sites cleaned and kept, with reasons", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.b.test", "keep");
  await visit(ctx, hooks, "https://b.test/");
  const a = await visit(ctx, hooks, "https://a.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);
  const p = await settingsPage(ctx, extId, "#section=log");
  const entry = p.locator("details.log-entry").first();
  await expect(entry.locator("summary")).toContainText("Tab closed");
  await entry.locator("summary").click();
  const detail = entry.locator(".detail");
  await expect(detail).toContainText("a.test");
  await expect(detail).toContainText("tracker.test");
  await expect(detail).toContainText("b.test On Keep list");
  await expect(detail).toContainText("app.test Open in a tab");
});

test("LOG-03 chrome.storage.local holds no cookie values after cleanups", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "setCookie", { url: "https://x.test/", name: "sid", value: "SECRET-VALUE-LOG", secure: true, expirationDate: Math.floor(Date.now() / 1000) + 3600 });
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  await app.close();
  await call(hooks, "send", { type: "cleanNow" });
  await call(hooks, "send", { type: "cleanIncludingOpen" });
  const local = JSON.stringify(await call(hooks, "rawGet", null));
  expect(local).not.toContain("SECRET-VALUE-LOG");
  expect(local).not.toContain("abc123"); // app.test's session cookie value
  expect(local).toContain("cleanupLog");
});

async function importThroughUi(p: Page, file: string): Promise<void> {
  await p.locator("#import-file").setInputFiles(file);
  await expect(p.getByRole("dialog")).toBeVisible();
}

test("IMP-01 importing the Cookie AutoDelete documentation example: preview first, then the right lists and cookie names", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const p = await settingsPage(ctx, extId);
  await importThroughUi(p, FIXTURE);
  await expect(p.getByRole("dialog")).toContainText("4 rules to add, 0 rules to replace, 0 rules that can't be imported.");
  expect(await rules(hooks)).toEqual([]); // nothing changes before confirming
  await p.getByRole("dialog").getByRole("button", { name: "Import rules" }).click();
  await expect.poll(async () => (await rules(hooks)).length).toBe(4);
  const r = await rules(hooks);
  expect(r.map((x) => [x.pattern, x.list, x.cookies.mode === "named" ? x.cookies.names.join(",") : "all"])).toEqual([
    ["/mozilla/", "keep", "_gid,taarId"],
    ["/example.com/", "keep", "_gid,taarId"],
    ["github.com", "restart", "all"],
    ["example.com", "keep", "all"],
  ]);
});

test("IMP-02 a file with Firefox container lists: the preview offers merge or skip, and the choice is respected", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "imp02-")), "containers.json");
  fs.writeFileSync(file, JSON.stringify({ default: [{ expression: "main.test", listType: "WHITE", storeId: "default" }], "firefox-container-1": [{ expression: "work.test", listType: "WHITE", storeId: "firefox-container-1" }] }));
  const p = await settingsPage(ctx, extId);
  await importThroughUi(p, file);
  await expect(p.getByRole("dialog")).toContainText("The file has 1 rule from Firefox container lists");
  await p.getByRole("dialog").getByRole("button", { name: "Import rules" }).click(); // default: skip
  await expect.poll(async () => (await rules(hooks)).map((r) => r.pattern)).toEqual(["main.test"]);
  await importThroughUi(p, file);
  await p.getByLabel("Add container rules to the main lists").check();
  await expect(p.getByRole("dialog")).toContainText("1 rule to add, 1 rule to replace");
  await p.getByRole("dialog").getByRole("button", { name: "Import rules" }).click();
  await expect.poll(async () => (await rules(hooks)).map((r) => r.pattern).sort()).toEqual(["main.test", "work.test"]);
});

test("IMP-03 importing a rule that already exists: shown as 'will replace', replaced only after confirming", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "github.com", "keep");
  const p = await settingsPage(ctx, extId);
  await importThroughUi(p, FIXTURE);
  await expect(p.getByRole("dialog")).toContainText("These rules already exist and will be replaced:");
  await expect(p.getByRole("dialog").locator("ul.skipped")).toContainText("github.com");
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await rules(hooks)).find((r) => r.pattern === "github.com")!.list).toBe("keep");
  await importThroughUi(p, FIXTURE);
  await p.getByRole("dialog").getByRole("button", { name: "Import rules" }).click();
  await expect.poll(async () => (await rules(hooks)).find((r) => r.pattern === "github.com")!.list).toBe("restart");
});

test("IMP-05 (UI) a malformed file shows a plain error and changes nothing", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "keep.test", "keep");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "imp05-")), "bad.json");
  fs.writeFileSync(file, "{ this is not json");
  const p = await settingsPage(ctx, extId);
  await importThroughUi(p, file);
  await expect(p.getByRole("dialog")).toContainText("The file isn't valid JSON.");
  expect((await rules(hooks)).map((r) => r.pattern)).toEqual(["keep.test"]);
});

test("export downloads the rules as a Cookie AutoDelete-format file", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.github.com", "keep");
  const p = await settingsPage(ctx, extId);
  const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Export rules" }).click()]);
  const text = fs.readFileSync((await download.path())!, "utf8");
  expect(JSON.parse(text).default[0]).toMatchObject({ expression: "*.github.com", listType: "WHITE", storeId: "default" });
});

test("DAT-06 turning a data type on offers once to clear existing data; declining clears nothing", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks, { siteData: { localStorage: false, indexedDB: true, cacheStorage: true, serviceWorkers: true, httpCache: false } });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  await sleep(4000); // tab-close cleanup ran with LocalStorage off
  const p = await settingsPage(ctx, extId);
  await p.click("#sd-localStorage");
  await expect(p.getByRole("dialog")).toContainText("Clear existing LocalStorage for 1 site that isn't kept?");
  await p.getByRole("dialog").getByRole("button", { name: "Not now" }).click();
  const back = await ctx.newPage();
  await back.goto("https://a.test/blank");
  expect((await back.evaluate(() => (window as any).readBack())).localStorage).toEqual({ a: "1" });
  await back.close();
  // turning it off and on again does not offer a second time
  await p.click("#sd-localStorage");
  await p.click("#sd-localStorage");
  await sleep(500);
  await expect(p.getByRole("dialog")).toHaveCount(0);
});

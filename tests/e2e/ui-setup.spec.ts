/** Phase C: first-run setup. */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { has, log, openPopup, sleep, tabIdOf, visit, waitForCleanup } from "./support/helpers";
import type { Rule } from "../../src/core/rules";
import type { Settings } from "../../src/core/settings";
import type { BrowserContext, Page } from "@playwright/test";

async function welcomePage(ctx: BrowserContext, extId: string): Promise<Page> {
  await expect.poll(() => ctx.pages().some((p) => p.url() === `chrome-extension://${extId}/welcome.html`), { timeout: 10_000 }).toBe(true);
  return ctx.pages().find((p) => p.url() === `chrome-extension://${extId}/welcome.html`)!;
}

test("SUP-01 fresh install with a.test and b.test open: welcome opens; both offered in step one", async ({ env: { ctx, hooks, extId } }) => {
  const welcome = await welcomePage(ctx, extId); // opened by onInstalled
  // Playwright can only load the extension at launch, so the sites are opened right after install
  // and the welcome page re-reads them on reload, as it would have on first load with them open.
  await visit(ctx, hooks, "https://a.test/");
  await visit(ctx, hooks, "https://b.test/");
  await welcome.reload();
  await expect(welcome.locator("#open-0")).toBeVisible();
  const offered = await welcome.locator(".picks").first().locator("label").allTextContents();
  expect(offered).toEqual(["a.test", "b.test"]);
  expect((await call<Settings>(hooks, "loadSettings")).autoClean).toBe(false);
});

test("SUP-02 before setup completes, close a.test and wait delay + 10 s: no cookies deleted anywhere", async ({ env: { ctx, hooks } }) => {
  await call(hooks, "saveSettings", { delaySeconds: 1 }); // setup still unfinished
  const a = await visit(ctx, hooks, "https://a.test/");
  const before = (await call<chrome.cookies.Cookie[]>(hooks, "cookies")).length;
  await a.close();
  await sleep(11_000);
  expect((await call<chrome.cookies.Cookie[]>(hooks, "cookies")).length).toBe(before);
  expect(await log(hooks)).toEqual([]);
});

test("SUP-03 tick a.test, choose automatic: a.test on Keep; automatic cleaning on immediately", async ({ env: { ctx, hooks, extId } }) => {
  const welcome = await welcomePage(ctx, extId);
  await visit(ctx, hooks, "https://a.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  await welcome.reload();
  await welcome.bringToFront();
  // keep only a.test
  for (const label of await welcome.locator(".picks label").all()) {
    const text = (await label.textContent())?.trim();
    const box = label.locator("input");
    if (text === "a.test") await box.check();
    else await box.uncheck();
  }
  await welcome.click("#step1-next");
  await welcome.click("#step2-next");
  await welcome.click("#start-auto");
  await expect(welcome.locator(".finished")).toContainText("Automatic cleaning is on.");
  const rules = await call<Rule[]>(hooks, "loadRules");
  expect(rules.map((r) => [r.pattern, r.list, r.cookies.mode])).toEqual([["*.a.test", "keep", "all"]]);
  const s = await call<Settings>(hooks, "loadSettings");
  expect([s.setupComplete, s.autoClean]).toEqual([true, true]);
  // immediately effective, no restart: closing app.test cleans it after the delay
  await call(hooks, "saveSettings", { delaySeconds: 1 });
  const t = Date.now();
  await app.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "first", "a.test")).toBe(true);
});

test("SUP-04 close the welcome tab mid-setup: automatic cleaning stays off; the popup offers to resume", async ({ env: { ctx, hooks, extId } }) => {
  const welcome = await welcomePage(ctx, extId);
  await welcome.click("#step1-next");
  await welcome.close();
  const s = await call<Settings>(hooks, "loadSettings");
  expect([s.setupComplete, s.autoClean]).toEqual([false, false]);
  await visit(ctx, hooks, "https://a.test/");
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await expect(popup.locator(".controls")).toContainText("Setup isn't finished, so nothing is cleaned automatically.");
  await expect(popup.getByRole("switch")).toHaveCount(0);
  await popup.getByRole("button", { name: "Finish setup" }).click();
  await expect.poll(() => ctx.pages().filter((p) => p.url().endsWith("/welcome.html")).length).toBe(1);
});

test("SUP-05 choose manual mode: nothing cleans automatically; popup buttons work", async ({ env: { ctx, hooks, extId } }) => {
  const welcome = await welcomePage(ctx, extId);
  await welcome.click("#step1-next");
  await welcome.click("#step2-next");
  await welcome.click("#start-manual");
  await expect(welcome.locator(".finished")).toContainText("Nothing is cleaned until you click Clean now");
  const s = await call<Settings>(hooks, "loadSettings");
  expect([s.setupComplete, s.autoClean]).toEqual([true, false]);
  await call(hooks, "saveSettings", { delaySeconds: 1 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  await sleep(6000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  await visit(ctx, hooks, "https://b.test/blank");
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://b.test/"));
  await expect(popup.getByRole("switch")).not.toBeChecked();
  await popup.getByRole("button", { name: "Clean now" }).click();
  await expect(popup.locator(".last")).toContainText("Cleaned");
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

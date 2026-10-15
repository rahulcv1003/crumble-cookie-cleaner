/**
 * Screenshots for the UI self-review (PRD "Self-review before calling the UI done"):
 * the popup in every state, light and dark; settings sections at 1280 px; the welcome flow.
 * Saved to docs/screenshots/. Run: npx playwright test tests/e2e/screenshots.spec.ts
 */
import { test } from "./support/fixture";
import { call } from "./support/browser";
import { configure, visit } from "./support/helpers";
import path from "node:path";
import fs from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

const OUT = path.resolve(process.cwd(), "docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

async function tabIdFor(hooks: Page, prefix: string): Promise<number> {
  const tabs = await call<chrome.tabs.Tab[]>(hooks, "tabs");
  return tabs.find((t) => t.url?.startsWith(prefix))!.id!;
}

async function shootPopup(ctx: BrowserContext, extId: string, tabId: number, name: string): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 340, height: 600 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
    await p.waitForSelector("header");
    await p.waitForTimeout(150);
    const h = await p.evaluate(() => document.body.scrollHeight);
    await p.setViewportSize({ width: 340, height: h });
    await p.screenshot({ path: path.join(OUT, `popup-${name}-${scheme}.png`) });
    await p.close();
  }
}

test("screenshots: popup in every state, light and dark", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks, { setupComplete: false, autoClean: false });
  await visit(ctx, hooks, "https://a.test/");
  const aId = await tabIdFor(hooks, "https://a.test/");
  await shootPopup(ctx, extId, aId, "setup-unfinished");
  await configure(hooks, { autoClean: false });
  await shootPopup(ctx, extId, aId, "automatic-off");
  await configure(hooks, { autoClean: true });
  await shootPopup(ctx, extId, aId, "will-be-cleaned");
  await call(hooks, "addRule", "*.a.test", "keep");
  await shootPopup(ctx, extId, aId, "kept");
  await call(hooks, "rawSet", { rules: [] });
  await call(hooks, "addRule", "*.a.test", "restart");
  await shootPopup(ctx, extId, aId, "kept-until-restart");
  const before = new Set((await call<chrome.tabs.Tab[]>(hooks, "tabs")).map((t) => t.id));
  const blank = await ctx.newPage();
  await blank.goto("chrome://version");
  const browserPageId = (await call<chrome.tabs.Tab[]>(hooks, "tabs")).find((t) => !before.has(t.id))!.id!;
  await shootPopup(ctx, extId, browserPageId, "not-a-website");
  // after a cleanup, with undo available
  await visit(ctx, hooks, "https://b.test/");
  const b = ctx.pages().find((p) => p.url().startsWith("https://b.test/"))!;
  await b.close();
  await call(hooks, "send", { type: "cleanNow" });
  await shootPopup(ctx, extId, aId, "after-cleanup");
});

test("screenshots: settings sections at 1280 px and the welcome flow", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.github.com", "keep");
  await call(hooks, "addRule", "example.com", "restart", { cookies: { mode: "named", names: ["sid", "lang"] }, note: "Work login" });
  await call(hooks, "addRule", "/google\\.(ca|com)/", "keep", { siteData: { localStorage: "clean", indexedDB: "keep", cacheStorage: "clean", serviceWorkers: "keep" } });
  await call(hooks, "addRule", "*.bbc.co.uk", "keep");
  await visit(ctx, hooks, "https://a.test/");
  const a = ctx.pages().find((p) => p.url().startsWith("https://a.test/"))!;
  await a.close();
  await call(hooks, "send", { type: "cleanNow" });
  for (const scheme of ["light", "dark"] as const) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.emulateMedia({ colorScheme: scheme });
    await p.goto(`chrome-extension://${extId}/settings.html`);
    await p.waitForSelector("#lists");
    for (const id of ["lists", "cleaning", "site-data", "log", "display", "about"]) {
      if (id === "log") await p.evaluate(() => document.querySelector("details.log-entry")?.setAttribute("open", ""));
      const el = p.locator(`#${id}`);
      await el.scrollIntoViewIfNeeded();
      await el.screenshot({ path: path.join(OUT, `settings-${id}-${scheme}.png`) });
    }
    await p.screenshot({ path: path.join(OUT, `settings-page-${scheme}.png`) });
    await p.close();
  }
  await visit(ctx, hooks, "https://app.test/");
  await visit(ctx, hooks, "https://b.test/");
  for (const scheme of ["light", "dark"] as const) {
    const w = await ctx.newPage();
    await w.setViewportSize({ width: 1280, height: 900 });
    await w.emulateMedia({ colorScheme: scheme });
    await call(hooks, "saveSettings", { setupComplete: false, autoClean: false });
    await w.goto(`chrome-extension://${extId}/welcome.html`);
    await w.waitForSelector("#step1-next");
    await w.screenshot({ path: path.join(OUT, `welcome-step1-${scheme}.png`), fullPage: true });
    await w.click("#step1-next");
    await w.waitForSelector("#step2-next");
    await w.screenshot({ path: path.join(OUT, `welcome-step2-${scheme}.png`), fullPage: true });
    await w.click("#step2-next");
    await w.waitForSelector("#start-auto");
    await w.screenshot({ path: path.join(OUT, `welcome-step3-${scheme}.png`), fullPage: true });
    await w.click("#start-auto");
    await w.waitForSelector(".finished");
    await w.screenshot({ path: path.join(OUT, `welcome-finished-${scheme}.png`), fullPage: true });
    await w.close();
  }
});

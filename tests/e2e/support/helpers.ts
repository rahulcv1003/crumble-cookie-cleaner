/** Shared E2E helpers for the engine tests. */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { call } from "./browser";
import type { Settings } from "../../../src/core/settings";
import type { LogEntry } from "../../../src/core/log";

export type Cookie = chrome.cookies.Cookie;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for onInstalled to finish, then applies settings (setup done, automatic cleaning on by default). */
export async function configure(hooks: Page, change: Partial<Omit<Settings, "schema">> = {}): Promise<Settings> {
  await expect.poll(async () => (await call<Record<string, unknown>>(hooks, "rawGet", ["settings"])).settings, { timeout: 10_000 }).toBeTruthy();
  return call<Settings>(hooks, "saveSettings", { setupComplete: true, autoClean: true, delaySeconds: 2, ...change });
}

export const cookies = (hooks: Page) => call<Cookie[]>(hooks, "cookies");
export const names = async (hooks: Page) =>
  (await cookies(hooks)).map((c) => `${c.name}@${c.domain}${c.partitionKey ? `^${c.partitionKey.topLevelSite}` : ""}`).sort();
export const has = async (hooks: Page, name: string, domain: string, partitioned?: boolean) =>
  (await cookies(hooks)).some((c) => c.name === name && c.domain === domain && (partitioned === undefined || Boolean(c.partitionKey) === partitioned));

export const log = async (hooks: Page) => ((await call<Record<string, unknown>>(hooks, "rawGet", ["cleanupLog"])).cleanupLog ?? []) as LogEntry[];

/** Opens a test site, waits for its storage writes, and waits until the worker has recorded the tab. */
export async function visit(ctx: BrowserContext, hooks: Page, url: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => (window as any).setupDone ?? true);
  const frame = page.frames().find((f) => f.url().startsWith("https://widget.test/"));
  if (frame) await frame.evaluate(() => (window as any).idbDone ?? true);
  const origin = new URL(url).origin;
  await expect
    .poll(async () => Object.values(((await call<Record<string, unknown>>(hooks, "sessionGet", ["tabUrls"])).tabUrls ?? {}) as Record<string, string>).some((u) => u.startsWith(origin)), { timeout: 5000 })
    .toBe(true);
  return page;
}

/** Opens a read-only page and returns what it can see (cookies, LocalStorage, IndexedDB, caches, service workers). */
export async function readBack(ctx: BrowserContext, url: string, frameHost?: string): Promise<any> {
  const page = await ctx.newPage();
  await page.goto(url);
  const target = frameHost ? page.frames().find((f) => f.url().startsWith(`https://${frameHost}/`))! : page;
  const result = await target.evaluate(() => (window as any).readBack());
  await page.close();
  return result;
}

/** Waits until a log entry newer than `since` exists, and returns it. */
export async function waitForCleanup(hooks: Page, since: number, timeoutMs = 20_000): Promise<LogEntry> {
  let found: LogEntry | undefined;
  await expect
    .poll(async () => {
      found = (await log(hooks)).find((e) => e.time >= since);
      return Boolean(found);
    }, { timeout: timeoutMs, intervals: [250] })
    .toBe(true);
  return found!;
}

/** Stops the extension's service worker through the DevTools protocol (the spike method). */
export async function stopServiceWorker(ctx: BrowserContext, page: Page, extId: string): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  const versions = new Map<string, { versionId: string; scriptURL: string; runningStatus: string }>();
  cdp.on("ServiceWorker.workerVersionUpdated", (e: any) => {
    for (const v of e.versions) versions.set(v.versionId, v);
  });
  await cdp.send("ServiceWorker.enable");
  await sleep(300);
  const running = [...versions.values()].filter((v) => v.scriptURL.startsWith(`chrome-extension://${extId}/`) && v.runningStatus === "running");
  for (const v of running) await cdp.send("ServiceWorker.stopWorker", { versionId: v.versionId });
  await expect
    .poll(() => [...versions.values()].filter((v) => v.scriptURL.startsWith(`chrome-extension://${extId}/`)).every((v) => v.runningStatus === "stopped"), { timeout: 5000 })
    .toBe(true);
  await cdp.send("ServiceWorker.disable").catch(() => undefined);
  await cdp.detach().catch(() => undefined);
}

/** Opens the popup as a page for a given tab (popup.html?tabId=N). */
export async function openPopup(ctx: BrowserContext, extId: string, tabId: number): Promise<Page> {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 340, height: 640 });
  await p.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await p.waitForSelector("header");
  return p;
}

export const tabIdOf = (hooks: Page, prefix: string) => call<number>(hooks, "tabIdByUrlPrefix", prefix);

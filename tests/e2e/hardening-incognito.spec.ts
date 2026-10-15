/** Phase D: incognito. Uses a persistent install so "Allow in Incognito" can be set in the profile. */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { call, copyExtension, installAsPersistent, launch, tempDir } from "./support/browser";
import { configure, has, log, sleep, visit, waitForCleanup } from "./support/helpers";

async function start(allowIncognito: boolean): Promise<{ ctx: BrowserContext; hooks: Page }> {
  const profile = tempDir("inc");
  const ext = copyExtension();
  const extId = await installAsPersistent(profile, ext, { allowIncognito });
  const run = await launch(profile, ext, { loadExtension: false, extId });
  const hooks = await run.hooks();
  await configure(hooks);
  return { ctx: run.ctx, hooks };
}

test("INC-01 incognito access not allowed: the extension does not touch incognito; the normal profile works", async () => {
  const { ctx, hooks } = await start(false);
  expect(await call(hooks, "isAllowedIncognito")).toBe(false);
  const opened = await call<any>(hooks, "openIncognito", "https://a.test/").catch((e: Error) => ({ error: e.message }));
  // Without incognito access the extension can't even see incognito cookie stores.
  expect((await call<chrome.cookies.CookieStore[]>(hooks, "cookieStores")).map((s) => s.id)).toEqual(["0"]);
  if (opened.windowId !== undefined) await call(hooks, "closeWindow", opened.windowId).catch(() => undefined);
  await sleep(4000);
  expect(await log(hooks)).toEqual([]);
  // normal profile still cleans
  const a = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "first", "a.test")).toBe(false);
  await ctx.close();
});

test("INC-02 incognito allowed; close an incognito tab: that site's incognito cookies are cleaned with the same rules", async () => {
  const { ctx, hooks } = await start(true);
  expect(await call(hooks, "isAllowedIncognito")).toBe(true);
  await call(hooks, "addRule", "*.b.test", "keep");
  const w1 = await call<{ windowId: number; tabId: number }>(hooks, "openIncognito", "https://a.test/");
  const w2 = await call<{ windowId: number; tabId: number }>(hooks, "openIncognito", "https://b.test/");
  const stores = (await call<chrome.cookies.CookieStore[]>(hooks, "cookieStores")).map((s) => s.id);
  expect(stores.length).toBe(2);
  const incognitoStore = stores.find((id) => id !== "0")!;
  const incognito = async () => (await call<chrome.cookies.Cookie[]>(hooks, "cookies")).filter((c) => c.storeId === incognitoStore);
  await expect.poll(async () => (await incognito()).some((c) => c.domain === "a.test")).toBe(true);
  const t = Date.now();
  await call(hooks, "removeTab", w1.tabId);
  await waitForCleanup(hooks, t);
  const left = await incognito();
  expect(left.some((c) => c.domain === "a.test")).toBe(false); // cleaned
  expect(left.some((c) => c.domain === "b.test")).toBe(true); // kept by the same rules
  await call(hooks, "closeWindow", w2.windowId).catch(() => undefined);
  await ctx.close();
});

test("INC-03 same site open in a normal window; incognito tab closed: normal-profile cookies untouched", async () => {
  const { ctx, hooks } = await start(true);
  await visit(ctx, hooks, "https://a.test/");
  const inc = await call<{ windowId: number; tabId: number }>(hooks, "openIncognito", "https://a.test/");
  const incognitoStore = (await call<chrome.cookies.CookieStore[]>(hooks, "cookieStores")).map((s) => s.id).find((id) => id !== "0")!;
  const t = Date.now();
  await call(hooks, "removeTab", inc.tabId);
  await waitForCleanup(hooks, t);
  const all = await call<chrome.cookies.Cookie[]>(hooks, "cookies");
  expect(all.some((c) => c.storeId === "0" && c.domain === "a.test")).toBe(true); // normal profile, open site: untouched
  expect(all.some((c) => c.storeId === incognitoStore && c.domain === "a.test")).toBe(false);
  await ctx.close();
});

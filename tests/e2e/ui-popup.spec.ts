/** Phase C: popup, badge and toolbar icon. */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, cookies, has, openPopup, readBack, sleep, tabIdOf, visit } from "./support/helpers";
import type { Rule } from "../../src/core/rules";

test("POP-01 popup on an unlisted open site: 'Will be cleaned after you close it' and the right cookie count", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const count = (await cookies(hooks)).filter((c) => c.domain === "a.test").length;
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await expect(popup.locator(".site .label")).toHaveText("a.test");
  await expect(popup.locator(".site .status")).toHaveText(`Will be cleaned after you close it. ${count} cookie${count === 1 ? "" : "s"}.`);
});

test("PRT-06 popup on b.test: the cookie count includes partitioned cookies under b.test", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://b.test/");
  const all = await cookies(hooks);
  const own = all.filter((c) => c.domain === "b.test" && !c.partitionKey).length;
  const embedded = all.filter((c) => c.partitionKey?.topLevelSite === "https://b.test").length;
  expect(embedded).toBeGreaterThan(0);
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://b.test/"));
  await expect(popup.locator(".site .status")).toContainText(`${own + embedded} cookies.`);
});

test("POP-02 click Keep: rule *.<registrable domain> added; status and icon update immediately", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const tabId = await tabIdOf(hooks, "https://a.test/");
  await expect.poll(() => call(hooks, "iconFor", tabId)).toBe("status-clean");
  const popup = await openPopup(ctx, extId, tabId);
  await popup.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(popup.locator(".site .status")).toContainText("Kept.");
  const rules = await call<Rule[]>(hooks, "loadRules");
  expect(rules.map((r) => [r.pattern, r.list])).toEqual([["*.a.test", "keep"]]);
  await expect.poll(() => call(hooks, "iconFor", tabId), { timeout: 1000 }).toBe("status-keep");
});

test("POP-03 Keep until restart, then Remove from list: the status updates each time", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const tabId = await tabIdOf(hooks, "https://a.test/");
  const popup = await openPopup(ctx, extId, tabId);
  await popup.getByRole("button", { name: "Keep until restart" }).click();
  await expect(popup.locator(".site .status")).toContainText("Kept until restart.");
  await expect.poll(() => call(hooks, "iconFor", tabId), { timeout: 1000 }).toBe("status-restart");
  await popup.getByRole("button", { name: "Remove from list" }).click();
  await expect(popup.locator(".site .status")).toContainText("Will be cleaned after you close it.");
  expect(await call<Rule[]>(hooks, "loadRules")).toEqual([]);
  await expect.poll(() => call(hooks, "iconFor", tabId), { timeout: 1000 }).toBe("status-clean");
});

test("POP-04 'Clean this site now' on an open site: its cookies and site data removed; page not reloaded", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.evaluate(() => ((window as any).__marker = "still here"));
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await popup.getByRole("button", { name: "Clean this site now" }).click();
  await expect(popup.locator(".last")).toContainText("Cleaned 1 site");
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await a.evaluate(() => (window as any).__marker)).toBe("still here");
  await a.close();
  expect(await readBack(ctx, "https://a.test/blank")).toMatchObject({ localStorage: {}, indexedDB: [], caches: [], serviceWorkers: [] });
});

test("POP-05 'Clean, including open tabs': the confirmation shows the count; on confirm, open non-kept sites are cleaned", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.b.test", "keep");
  await visit(ctx, hooks, "https://a.test/");
  await visit(ctx, hooks, "https://b.test/");
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await popup.getByRole("button", { name: "Clean, including open tabs" }).click();
  const dialog = popup.getByRole("alertdialog");
  // a.test, tracker.test and widget.test (its own third-party cookie) are not kept; b.test is kept,
  // and the cookie widget.test set while embedded on b.test is kept with it.
  await expect(dialog).toContainText("Delete cookies and site data for 3 sites, including sites open in tabs? This can't be undone after 2 minutes.");
  expect(await has(hooks, "first", "a.test")).toBe(true); // nothing changes before confirming
  await dialog.getByRole("button", { name: "Delete cookies and site data" }).click();
  await expect(popup.locator(".last")).toContainText("Cleaned 3 sites");
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "trk", "tracker.test")).toBe(false);
  expect(await has(hooks, "plain", "widget.test", false)).toBe(false);
  expect(await has(hooks, "first", "b.test")).toBe(true);
  expect(await has(hooks, "part", "widget.test", true)).toBe(true);
});

test("POP-06 popup on a browser page: 'Not a website'; site actions hidden", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const before = new Set((await call<chrome.tabs.Tab[]>(hooks, "tabs")).map((t) => t.id));
  const page = await ctx.newPage();
  await page.goto("chrome://version");
  const tabId = (await call<chrome.tabs.Tab[]>(hooks, "tabs")).find((t) => !before.has(t.id))!.id!;
  const popup = await openPopup(ctx, extId, tabId);
  await expect(popup.locator(".site .label")).toHaveText("Not a website");
  await expect(popup.getByRole("button", { name: "Keep", exact: true })).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "Clean this site now" })).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "Clean now" })).toHaveCount(1);
  await expect.poll(() => call(hooks, "iconFor", tabId)).toBe("status-none");
});

test("BDG-01 switching between a kept, a restart and an unlisted site changes the icon within 1 s", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.a.test", "keep");
  await call(hooks, "addRule", "*.b.test", "restart");
  await visit(ctx, hooks, "https://a.test/");
  await visit(ctx, hooks, "https://b.test/");
  await visit(ctx, hooks, "https://app.test/");
  for (const [prefix, icon] of [["https://a.test/", "status-keep"], ["https://b.test/", "status-restart"], ["https://app.test/", "status-clean"], ["https://a.test/", "status-keep"]] as const) {
    const id = await tabIdOf(hooks, prefix);
    await call(hooks, "activate", id);
    await expect.poll(() => call(hooks, "iconFor", id), { timeout: 1000, intervals: [50] }).toBe(icon);
  }
});

test("BDG-02 automatic cleaning off: greyscale icon", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const id = await tabIdOf(hooks, "https://a.test/");
  await expect.poll(() => call(hooks, "iconFor", id)).toBe("status-clean");
  await configure(hooks, { autoClean: false });
  await expect.poll(() => call(hooks, "iconFor", id), { timeout: 1000 }).toBe("status-clean-off");
});

test("BDG-03 badge off in settings: no badge text", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const id = await tabIdOf(hooks, "https://a.test/");
  await expect.poll(() => call(hooks, "badgeText", id)).toMatch(/^[1-9]/);
  const s = await call<any>(hooks, "loadSettings");
  await configure(hooks, { display: { ...s.display, badge: false } });
  await expect.poll(() => call(hooks, "badgeText", id), { timeout: 1000 }).toBe("");
});

test("DEC-13 (popup part) full profile at the cookie cap: progress shown in the popup, which stays responsive", async ({ env: { ctx, hooks, extId } }) => {
  test.setTimeout(120_000);
  await configure(hooks);
  await hooks.evaluate(async () => {
    const jobs: Promise<unknown>[] = [];
    for (let h = 0; h < 500; h++) for (let i = 0; i < 10; i++) jobs.push(chrome.cookies.set({ url: `https://h${h}.test/`, name: `c${i}`, value: "v", secure: true, sameSite: "no_restriction" }));
    await Promise.all(jobs);
  });
  await visit(ctx, hooks, "https://a.test/");
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await popup.getByRole("button", { name: "Clean now" }).click();
  await expect(popup.locator(".last")).toContainText(/Cleaning [\d,]+ of [\d,]+ cookies/, { timeout: 10_000 });
  // responsive while it runs: the page answers immediately
  const t0 = Date.now();
  await popup.evaluate(() => document.title);
  expect(Date.now() - t0).toBeLessThan(500);
  await expect(popup.locator(".last")).toContainText(/Cleaned [\d,]+ sites/, { timeout: 60_000 });
  expect((await cookies(hooks)).filter((c) => /^h\d+\.test$/.test(c.domain))).toEqual([]);
});

test("UND-01 undo within 2 minutes: deleted cookies restored, a partitioned one included; logged back in on app.test", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  const b = await visit(ctx, hooks, "https://b.test/");
  await app.close();
  await b.close();
  await visit(ctx, hooks, "https://a.test/blank");
  const res = await call<any>(hooks, "send", { type: "cleanNow" });
  expect(await has(hooks, "session", "app.test")).toBe(false);
  expect(await has(hooks, "part", "widget.test", true)).toBe(false);
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await popup.getByRole("button", { name: "Undo cleanup" }).click();
  await expect(popup.locator(".last")).toContainText(`Restored ${res.entry.cookiesDeleted} cookies. Site data can't be restored.`);
  expect(await has(hooks, "session", "app.test")).toBe(true);
  expect(await has(hooks, "part", "widget.test", true)).toBe(true);
  const again = await ctx.newPage();
  await again.goto("https://app.test/");
  await expect(again.locator("#state")).toHaveText("Logged in");
});

test("UND-02 after 2 minutes: undo gone; chrome.storage.session holds no cookie values", async ({ env: { ctx, hooks, extId } }) => {
  test.setTimeout(200_000);
  await configure(hooks);
  await call(hooks, "setCookie", { url: "https://secret.test/", name: "sid", value: "SECRET-VALUE-42", secure: true, expirationDate: Math.floor(Date.now() / 1000) + 3600 });
  await call(hooks, "send", { type: "cleanNow" });
  expect(JSON.stringify(await call(hooks, "sessionGet", null))).toContain("SECRET-VALUE-42");
  await sleep(125_000);
  expect(JSON.stringify(await call(hooks, "sessionGet", null))).not.toContain("SECRET-VALUE-42");
  expect(JSON.stringify(await call(hooks, "rawGet", null))).not.toContain("SECRET-VALUE-42");
  const tab = await visit(ctx, hooks, "https://a.test/blank");
  void tab;
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await expect(popup.getByRole("button", { name: "Undo cleanup" })).toHaveCount(0);
});

// Chrome evicts the least recently used cookies when a site is over its limit, and restored cookies
// are the newest, so a full site rarely drops them. The same "Chrome silently refuses a restored
// cookie" path is forced reliably here with cookies that expire before undo; the message must
// report only what is really back.
test("UND-04 undo when Chrome refuses restored cookies: the message reports only cookies actually restored", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await hooks.evaluate(async () => {
    const soon = Math.floor(Date.now() / 1000) + 4;
    const later = Math.floor(Date.now() / 1000) + 3600;
    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => chrome.cookies.set({ url: "https://full.test/", name: `short${i}`, value: "v", secure: true, expirationDate: soon })),
      ...Array.from({ length: 5 }, (_, i) => chrome.cookies.set({ url: "https://full.test/", name: `long${i}`, value: "v", secure: true, expirationDate: later })),
    ]);
  });
  const res = await call<any>(hooks, "send", { type: "cleanNow" });
  expect(res.entry.cookiesDeleted).toBe(25);
  await sleep(5000); // the short cookies' expiry passes; Chrome will refuse to set them again
  await visit(ctx, hooks, "https://a.test/blank");
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await popup.getByRole("button", { name: "Undo cleanup" }).click();
  await expect(popup.locator(".last")).toContainText("Restored 5 cookies. Site data can't be restored.");
  expect((await cookies(hooks)).filter((c) => c.domain === "full.test").map((c) => c.name).sort()).toEqual(["long0", "long1", "long2", "long3", "long4"]);
});

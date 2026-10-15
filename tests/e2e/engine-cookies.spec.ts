/** Phase B: cookie cleanup end to end (partitioned, third-party, named cookies, removal URLs). */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, has, names, log, sleep, visit, waitForCleanup } from "./support/helpers";

test("PRT-01 close b.test: the partitioned widget.test cookie under b.test is deleted", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const b = await visit(ctx, hooks, "https://b.test/");
  expect(await has(hooks, "part", "widget.test", true)).toBe(true);
  const t = Date.now();
  await b.close();
  const entry = await waitForCleanup(hooks, t);
  expect(await has(hooks, "part", "widget.test", true)).toBe(false);
  expect(entry.sitesCleaned.map((s) => s.site)).toContain("b.test");
});

test("PRT-02 b.test on Keep with 'keep embedded cookies on kept sites' on: the partitioned cookie is kept", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { keepEmbeddedOnKeptSites: true });
  await call(hooks, "addRule", "*.b.test", "keep");
  const b = await visit(ctx, hooks, "https://b.test/");
  const t = Date.now();
  await b.close();
  const entry = await waitForCleanup(hooks, t);
  expect(await has(hooks, "part", "widget.test", true)).toBe(true);
  expect(entry.sitesKept).toContainEqual(expect.objectContaining({ site: "b.test", reason: "keepList" }));
});

test("PRT-03 same with the option off: the partitioned cookie is deleted", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { keepEmbeddedOnKeptSites: false });
  await call(hooks, "addRule", "*.b.test", "keep");
  const b = await visit(ctx, hooks, "https://b.test/");
  const t = Date.now();
  await b.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "part", "widget.test", true)).toBe(false);
  expect(await has(hooks, "first", "b.test")).toBe(true); // b.test's own cookie is still kept
});

test("PRT-04 widget.test open directly; close b.test: partitioned cookie deleted, widget.test's own cookie kept", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const b = await visit(ctx, hooks, "https://b.test/");
  await visit(ctx, hooks, "https://widget.test/");
  const t = Date.now();
  await b.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "part", "widget.test", true)).toBe(false);
  expect(await has(hooks, "plain", "widget.test", false)).toBe(true);
});

test("PRT-05 visit a.test (loads tracker.test), close it: the tracker cookie is deleted in the same cleanup", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const a = await visit(ctx, hooks, "https://a.test/");
  expect(await has(hooks, "trk", "tracker.test")).toBe(true);
  const t = Date.now();
  await a.close();
  const entry = await waitForCleanup(hooks, t);
  expect(await has(hooks, "trk", "tracker.test")).toBe(false);
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(entry.sitesCleaned.map((s) => s.site)).toEqual(expect.arrayContaining(["a.test", "tracker.test"]));
  expect((await log(hooks)).length).toBe(1);
});

test("RUL-10 Keep rule with named cookies sid, lang: only those survive; the others are deleted", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.a.test", "keep", { cookies: { mode: "named", names: ["sid", "lang"] } });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.evaluate(() => {
    document.cookie = "sid=1; Secure; Path=/";
    document.cookie = "lang=en; Secure; Path=/";
    document.cookie = "other=x; Secure; Path=/";
  });
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);
  const left = (await names(hooks)).filter((n) => n.endsWith("@a.test"));
  expect(left).toEqual(["lang@a.test", "sid@a.test"]);
});

test("DEC-11 cookie with a leading-dot domain, Secure flag and a path is deleted", async ({ env: { hooks } }) => {
  await configure(hooks);
  await call(hooks, "setCookie", { url: "https://shop.a.test/cart", name: "dot", value: "1", domain: ".a.test", path: "/cart", secure: true });
  expect(await has(hooks, "dot", ".a.test")).toBe(true);
  const res = await call<any>(hooks, "send", { type: "cleanNow" });
  expect(res.ok).toBe(true);
  expect(await has(hooks, "dot", ".a.test")).toBe(false);
  expect(res.entry.failures).toEqual([]);
});

// Discarding a tab (chrome.tabs.discard) works, but Playwright then loses its connection to the
// whole browser, so this cannot run under automation. The decision is covered by the DEC-08 unit
// test; the real-browser check is on the manual checklist (docs/MANUAL-TESTS.md).
test.skip("DEC-08 discarded tab: kept while 'clean discarded tabs' is off, deleted when on", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  await call(hooks, "discardTabWithUrlPrefix", "https://a.test/");
  await call(hooks, "send", { type: "cleanNow" });
  expect(await has(hooks, "first", "a.test")).toBe(true);
  await configure(hooks, { cleanDiscardedTabs: true });
  await call(hooks, "send", { type: "cleanNow" });
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

test("DEC-09 two tabs closed within the same second produce one cleanup", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { delaySeconds: 3 });
  const a = await visit(ctx, hooks, "https://a.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  const t = Date.now();
  await Promise.all([a.close(), app.close()]);
  await waitForCleanup(hooks, t);
  await sleep(4000);
  expect((await log(hooks)).filter((e) => e.time >= t)).toHaveLength(1);
});

test("TRG-10 automatic cleaning off: tab close cleans nothing; manual buttons still work", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { autoClean: false, delaySeconds: 1 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  await sleep(6000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  expect(await log(hooks)).toEqual([]);
  const res = await call<any>(hooks, "send", { type: "cleanNow" });
  expect(res.entry.cookiesDeleted).toBeGreaterThan(0);
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

test("manual 'Clean, including open tabs' cleans open sites but not listed ones; 'Clean this site' cleans one site", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "app.test", "keep");
  await visit(ctx, hooks, "https://a.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  await call(hooks, "send", { type: "cleanNow" });
  expect(await has(hooks, "first", "a.test")).toBe(true); // open
  await call(hooks, "send", { type: "cleanIncludingOpen" });
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "session", "app.test")).toBe(true); // kept
  await call(hooks, "send", { type: "cleanSite", site: "app.test", origin: "https://app.test" });
  expect(await has(hooks, "session", "app.test")).toBe(false);
});

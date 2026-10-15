/** Phase B: site data cleaning end to end. */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, has, readBack, visit, waitForCleanup } from "./support/helpers";
import type { Settings } from "../../src/core/settings";

const EMPTY_A = { localStorage: {}, indexedDB: [], caches: [], serviceWorkers: [] };

test("DAT-01 visit a.test, close it, all types on: LocalStorage, IndexedDB, Cache Storage and Service Worker gone", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const a = await visit(ctx, hooks, "https://a.test/");
  expect(await a.evaluate(() => (window as any).readBack())).toMatchObject({ localStorage: { a: "1" }, indexedDB: ["adb"], caches: ["acache"], serviceWorkers: ["https://a.test/"] });
  const t = Date.now();
  await a.close();
  const entry = await waitForCleanup(hooks, t);
  expect(entry.sitesCleaned.find((s) => s.site === "a.test")?.siteData).toEqual(["localStorage", "indexedDB", "cacheStorage", "serviceWorkers"]);
  expect(await readBack(ctx, "https://a.test/blank")).toMatchObject(EMPTY_A);
});

test("DAT-02 each site data type turned off in turn survives; the others are cleaned", async ({ env: { ctx, hooks } }) => {
  const types: (keyof Settings["siteData"])[] = ["localStorage", "indexedDB", "cacheStorage", "serviceWorkers"];
  for (const off of types) {
    const siteData = { localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true, httpCache: false, [off]: false };
    await configure(hooks, { siteData });
    const a = await visit(ctx, hooks, "https://a.test/");
    const t = Date.now();
    await a.close();
    await waitForCleanup(hooks, t);
    const r = await readBack(ctx, "https://a.test/blank");
    const present = { localStorage: Object.keys(r.localStorage).length > 0, indexedDB: r.indexedDB.length > 0, cacheStorage: r.caches.length > 0, serviceWorkers: r.serviceWorkers.length > 0 };
    expect(present, `with ${off} off`).toEqual({ localStorage: false, indexedDB: false, cacheStorage: false, serviceWorkers: false, [off]: true });
  }
});

test("DAT-03 Keep rule with LocalStorage set to Clean: cookies kept, LocalStorage cleaned", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.a.test", "keep", { siteData: { localStorage: "clean", indexedDB: "keep", cacheStorage: "keep", serviceWorkers: "keep" } });
  const a = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  const r = await readBack(ctx, "https://a.test/blank");
  expect(r.localStorage).toEqual({});
  expect(r.indexedDB).toEqual(["adb"]);
  expect(r.caches).toEqual(["acache"]);
});

test("DAT-04 a site still open keeps its site data", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const a = await visit(ctx, hooks, "https://a.test/");
  await call(hooks, "send", { type: "cleanNow" });
  expect(await a.evaluate(() => (window as any).readBack())).toMatchObject({ localStorage: { a: "1" }, indexedDB: ["adb"], caches: ["acache"], serviceWorkers: ["https://a.test/"] });
});

test("DAT-05 visit b.test (embeds widget.test), close it: embedded LocalStorage and IndexedDB under b.test are gone", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const b = await visit(ctx, hooks, "https://b.test/");
  const t = Date.now();
  await b.close();
  await waitForCleanup(hooks, t);
  const r = await readBack(ctx, "https://b.test/ro", "widget.test");
  expect(r.localStorage).toEqual({});
  expect(r.indexedDB).toEqual([]);
});

test("DAT-08 b.test on Keep with site data kept: embedded data under b.test survives", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.b.test", "keep");
  const b = await visit(ctx, hooks, "https://b.test/");
  const t = Date.now();
  await b.close();
  await waitForCleanup(hooks, t);
  const r = await readBack(ctx, "https://b.test/ro", "widget.test");
  expect(r.localStorage).toEqual({ w: "1" });
  expect(r.indexedDB).toEqual(["wdb"]);
});

test("DAT-09 widget.test opened directly, then closed: its own direct LocalStorage is cleaned by its own origin", async ({ env: { ctx, hooks } }) => {
  await configure(hooks);
  const w = await visit(ctx, hooks, "https://widget.test/");
  await w.evaluate(() => localStorage.setItem("direct", "1"));
  const t = Date.now();
  await w.close();
  await waitForCleanup(hooks, t);
  expect((await readBack(ctx, "https://widget.test/")).localStorage).toEqual({});
});

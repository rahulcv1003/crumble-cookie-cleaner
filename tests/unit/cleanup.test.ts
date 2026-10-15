import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeChrome, type FakeChrome } from "./fake-chrome";
import { requestCleanup, resetQueueForTests, restoreUndo, runCleanup, removalDetails, undoAvailable, expireUndo } from "../../src/background/cleanup";
import { recordOrigins } from "../../src/background/seen-origins";
import { appendLogEntry, type LogEntry } from "../../src/core/log";
import { createRule } from "../../src/core/rules";
import { defaultSettings } from "../../src/core/settings";

let fake: FakeChrome;
beforeEach(async () => {
  fake = installFakeChrome();
  resetQueueForTests();
  await chrome.storage.local.set({ settings: { ...defaultSettings(), setupComplete: true, autoClean: true }, rules: [] });
});

const log = async () => ((await chrome.storage.local.get("cleanupLog")).cleanupLog ?? []) as LogEntry[];

describe("Cleanup decision (engine)", () => {
  it("DEC-09 two triggers within one second produce one cleanup", async () => {
    fake.addCookie({ name: "a", domain: "a.test" });
    const getAllCallsBefore = fake.api.cookies.getAllCookieStores.mock.calls.length;
    const [first, second] = await Promise.all([requestCleanup({ kind: "tabClose" }), requestCleanup({ kind: "tabClose" })]);
    expect(first).toBeDefined();
    expect(second).toBe(first); // the second trigger was merged into the same run
    expect(await log()).toHaveLength(1);
    expect(fake.api.cookies.getAllCookieStores.mock.calls.length - getAllCallsBefore).toBeLessThanOrEqual(3);
  });

  it("DEC-09b a trigger during a running cleanup becomes one follow-up run, not an overlapping one", async () => {
    fake.addCookie({ name: "a", domain: "a.test" });
    let concurrent = 0;
    let maxConcurrent = 0;
    const realGetAll = fake.api.cookies.getAll.getMockImplementation()!;
    fake.api.cookies.getAll.mockImplementation(async (d) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 40));
      concurrent--;
      return realGetAll(d);
    });
    const p1 = requestCleanup({ kind: "tabClose" });
    await new Promise((r) => setTimeout(r, 80)); // p1 has started (after the 50 ms merge pause)
    const p2 = requestCleanup({ kind: "tabClose" });
    const p3 = requestCleanup({ kind: "tabClose" });
    const [e1, e2, e3] = await Promise.all([p1, p2, p3]);
    expect(e2).toBe(e3);
    expect(e1).not.toBe(e2);
    expect(await log()).toHaveLength(2);
    expect(maxConcurrent).toBe(1);
  });

  it("DEC-10 a failing remove does not stop the others; it is counted and logged, not reported as deleted", async () => {
    fake.addCookie({ name: "a", domain: "a.test" });
    fake.addCookie({ name: "b", domain: "b.test" });
    fake.addCookie({ name: "c", domain: "c.test" });
    fake.makeThrowing("b", "b.test");
    const entry = await runCleanup({ kind: "tabClose" });
    expect(fake.names()).toEqual(["b@b.test"]);
    expect(entry.cookiesDeleted).toBe(2);
    expect(entry.failures).toEqual([{ site: "b.test", cookieName: "b", kind: "cookie" }]);
    expect(entry.sitesCleaned.map((s) => s.site)).not.toContain("b.test");
  });

  it("DEC-12 remove reports success but the cookie is still there: re-read catches it, retried once, logged as failure", async () => {
    fake.addCookie({ name: "stuck", domain: "a.test" });
    fake.addCookie({ name: "ok", domain: "a.test" });
    fake.makeUndeletable("stuck", "a.test");
    const entry = await runCleanup({ kind: "tabClose" });
    const removeCallsForStuck = fake.api.cookies.remove.mock.calls.filter(([d]) => d.name === "stuck").length;
    expect(removeCallsForStuck).toBe(2); // first attempt + one retry
    expect(entry.cookiesDeleted).toBe(1);
    expect(entry.failures).toEqual([{ site: "a.test", cookieName: "stuck", kind: "cookie" }]);
    const undo = (await chrome.storage.session.get("undo")).undo as { cookies: { name: string }[] };
    expect(undo.cookies.map((c) => c.name)).toEqual(["ok"]); // never claims the stuck one
  });

  it("DEC-11 a leading-dot, Secure cookie with a path is removed", async () => {
    fake.addCookie({ name: "s", domain: ".shop.example.com", path: "/cart", secure: true });
    await runCleanup({ kind: "tabClose" });
    expect(fake.names()).toEqual([]);
    expect(fake.api.cookies.remove.mock.calls[0]![0]).toMatchObject({ url: "https://shop.example.com/cart", name: "s" });
  });
});

describe("Partitioned and third-party cookies (engine)", () => {
  it("PRT-07 removal always passes the exact partitionKey", async () => {
    const pk = { topLevelSite: "https://b.test", hasCrossSiteAncestor: true };
    fake.addCookie({ name: "part", domain: "widget.test", partitionKey: pk });
    fake.addCookie({ name: "plain", domain: "widget.test" });
    fake.addCookie({ name: "trk", domain: "tracker.test" });
    const entry = await runCleanup({ kind: "tabClose" });
    expect(fake.names()).toEqual([]);
    expect(entry.cookiesDeleted).toBe(3);
    const partCall = fake.api.cookies.remove.mock.calls.find(([d]) => d.name === "part")![0];
    expect(partCall.partitionKey).toEqual(pk);
    const plainCall = fake.api.cookies.remove.mock.calls.find(([d]) => d.name === "plain")![0];
    expect(plainCall).not.toHaveProperty("partitionKey");
    // removalDetails copies the key, never shares the object
    const c = fake.addCookie({ name: "x", domain: "w.test", partitionKey: pk });
    expect(removalDetails(c).partitionKey).toEqual(pk);
    expect(removalDetails(c).partitionKey).not.toBe(c.partitionKey);
  });

  it("a partitioned cookie is attributed to its top-level site in the log", async () => {
    fake.addCookie({ name: "part", domain: "widget.test", partitionKey: { topLevelSite: "https://b.test", hasCrossSiteAncestor: true } });
    const entry = await runCleanup({ kind: "tabClose" });
    expect(entry.sitesCleaned).toEqual([{ site: "b.test", cookies: 1, siteData: [] }]);
  });

  it("all cookie stores are swept", async () => {
    fake.addStore("1");
    fake.addCookie({ name: "n", domain: "a.test" });
    fake.addCookie({ name: "i", domain: "a.test", storeId: "1" });
    await runCleanup({ kind: "manual" });
    expect(fake.cookies()).toEqual([]);
  });
});

describe("Site data (engine)", () => {
  it("DAT-07 browsingData is never called with cookies: true", async () => {
    await chrome.storage.local.set({ settings: { ...defaultSettings(), setupComplete: true, autoClean: true, siteData: { ...defaultSettings().siteData, httpCache: true } } });
    await recordOrigins(["https://a.test", "https://b.test"]);
    fake.addCookie({ name: "a", domain: "a.test" });
    await runCleanup({ kind: "tabClose" });
    await runCleanup({ kind: "manual", includeOpen: true });
    await runCleanup({ kind: "startup" });
    await runCleanup({ kind: "site", site: "a.test", origins: ["https://a.test"] });
    expect(fake.api.browsingData.remove).toHaveBeenCalled();
    for (const [, types] of fake.api.browsingData.remove.mock.calls) expect(types).not.toHaveProperty("cookies");
  });

  it("cleans recorded origins of closed unkept sites in one call, skips open and kept ones, and forgets cleaned origins", async () => {
    await chrome.storage.local.set({ rules: [createRule("k.test", "keep", () => "r1", 0)] });
    await recordOrigins(["https://a.test", "https://b.test", "https://open.test", "https://k.test"]);
    fake.setTabs([{ url: "https://open.test/" }]);
    const entry = await runCleanup({ kind: "tabClose" });
    expect(fake.api.browsingData.remove).toHaveBeenCalledTimes(1);
    const [options, types] = fake.api.browsingData.remove.mock.calls[0]!;
    expect(options).toEqual({ origins: ["https://a.test", "https://b.test"] });
    expect(types).toEqual({ localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true });
    expect(entry.sitesCleaned.map((s) => s.site)).toEqual(["a.test", "b.test"]);
    const pending = (await chrome.storage.local.get("pendingSiteDataOrigins")).pendingSiteDataOrigins;
    expect(pending).toEqual(["https://open.test", "https://k.test"]);
  });

  it("turned-off types are not cleaned (DAT-02 decision)", async () => {
    await chrome.storage.local.set({ settings: { ...defaultSettings(), autoClean: true, setupComplete: true, siteData: { ...defaultSettings().siteData, indexedDB: false } } });
    await recordOrigins(["https://a.test"]);
    await runCleanup({ kind: "tabClose" });
    expect(fake.api.browsingData.remove.mock.calls[0]![1]).toEqual({ localStorage: true, cacheStorage: true, serviceWorkers: true });
  });
});

describe("Log and undo (engine)", () => {
  it("LOG-02 60 cleanups keep only the last 50", async () => {
    let entries: LogEntry[] = [];
    for (let i = 0; i < 60; i++) entries = appendLogEntry(entries, { id: String(i), time: i } as LogEntry);
    expect(entries).toHaveLength(50);
    expect(entries[0]!.id).toBe("59");
    expect(entries[49]!.id).toBe("10");
    // and through the engine
    for (let i = 0; i < 55; i++) await runCleanup({ kind: "manual" });
    expect(await log()).toHaveLength(50);
  });

  it("the log never stores cookie values", async () => {
    fake.addCookie({ name: "sid", domain: "a.test", value: "SECRET-VALUE-123" });
    fake.addCookie({ name: "stuck", domain: "a.test", value: "SECRET-VALUE-456" });
    fake.makeUndeletable("stuck", "a.test");
    await runCleanup({ kind: "tabClose" });
    expect(JSON.stringify(fake.api.storage.local.dump())).not.toContain("SECRET-VALUE");
  });

  it("undo restores deleted cookies including partition keys and reports the confirmed count", async () => {
    const pk = { topLevelSite: "https://b.test", hasCrossSiteAncestor: true };
    fake.addCookie({ name: "session", domain: "app.test", value: "abc123", httpOnly: true, sameSite: "lax" });
    fake.addCookie({ name: "part", domain: "widget.test", partitionKey: pk });
    await runCleanup({ kind: "tabClose" });
    expect(fake.cookies()).toEqual([]);
    expect((await undoAvailable()).count).toBe(2);
    const res = await restoreUndo();
    expect(res).toEqual({ restored: 2, attempted: 2, expired: false });
    expect(fake.names()).toEqual(["part@widget.test^https://b.test", "session@app.test"]);
    expect(fake.cookies().find((c) => c.name === "session")).toMatchObject({ value: "abc123", httpOnly: true, sameSite: "lax", hostOnly: true });
    expect((await chrome.storage.session.get("undo")).undo).toBeUndefined();
  });

  it("undo reports only the cookies that really came back", async () => {
    fake.addCookie({ name: "a", domain: "a.test" });
    fake.addCookie({ name: "b", domain: "a.test" });
    await runCleanup({ kind: "tabClose" });
    const realSet = fake.api.cookies.set.getMockImplementation()!;
    fake.api.cookies.set.mockImplementation(async (d) => (d.name === "b" ? (null as never) : realSet(d)));
    expect(await restoreUndo()).toEqual({ restored: 1, attempted: 2, expired: false });
  });

  it("the undo buffer expires after 2 minutes and is then gone from session storage", async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });
    try {
      fake.addCookie({ name: "a", domain: "a.test", value: "VALUE" });
      await runCleanup({ kind: "tabClose" });
      expect(fake.alarms.get("undo-expire")?.scheduledTime).toBe(1_000_000 + 120_000);
      await expireUndo(1_000_000 + 119_000);
      expect((await undoAvailable(1_000_000 + 119_000)).available).toBe(true);
      await expireUndo(1_000_000 + 120_000);
      expect(JSON.stringify(fake.api.storage.session.dump())).not.toContain("VALUE");
      expect(await restoreUndo(1_000_000 + 121_000)).toMatchObject({ expired: true, restored: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

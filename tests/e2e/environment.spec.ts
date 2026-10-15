/**
 * Test environment self-check (not a PRD test ID): proves the E2E setup behaves like
 * the spikes found, so later phases can rely on it.
 */
import { expect, test } from "@playwright/test";
import { DIST_TEST, launch, tempDir } from "./support/browser";

test("ENV-01 extension loads; sites, third-party cookies, partitioning and mock login work", async () => {
  const { ctx, hooks } = await launch(tempDir("env"), DIST_TEST);
  try {
    const b = await ctx.newPage();
    await b.goto("https://b.test/");
    await b.evaluate(() => (window as any).setupDone);
    const frame = b.frames().find((f) => f.url().startsWith("https://widget.test/"))!;
    await frame.evaluate(() => (window as any).idbDone);
    const a = await ctx.newPage();
    await a.goto("https://a.test/");
    await a.evaluate(() => (window as any).setupDone);

    const h = await hooks();
    const cookies = await h.evaluate(() => chrome.cookies.getAll({ partitionKey: {} }));
    const byName = (name: string, domain: string) => cookies.find((c) => c.name === name && c.domain === domain);
    expect(byName("part", "widget.test")?.partitionKey).toEqual({ topLevelSite: "https://b.test", hasCrossSiteAncestor: true });
    expect(byName("plain", "widget.test")?.partitionKey).toBeUndefined();
    expect(byName("trk", "tracker.test")).toBeTruthy(); // third-party cookies allowed
    expect(byName("first", "a.test")).toBeTruthy();
    // storage partitioning on: embedded widget data is not visible to widget.test opened directly
    const direct = await ctx.newPage();
    await direct.goto("https://widget.test/");
    const d = await direct.evaluate(() => (window as any).readBack());
    expect(d.localStorage.w).toBeUndefined();
    expect(await frame.evaluate(() => localStorage.getItem("w"))).toBe("1");
    // a.test wrote every site data type
    const ra = await a.evaluate(() => (window as any).readBack());
    expect(ra).toMatchObject({ localStorage: { a: "1" }, indexedDB: ["adb"], caches: ["acache"], serviceWorkers: ["https://a.test/"] });
    // mock login app.test -> sso.test -> app.test
    const app = await ctx.newPage();
    await app.goto("https://app.test/");
    await expect(app.locator("#state")).toHaveText("Logged out");
    await app.click("#login");
    await app.waitForURL("https://app.test/");
    await expect(app.locator("#state")).toHaveText("Logged in");
  } finally {
    await ctx.close();
  }
});

/**
 * Phase B: tests that close and reopen the browser. They use a persistent install
 * (PRD "Test environment": --load-extension reinstalls on every launch, so onStartup
 * would never fire) and reuse one profile directory across the restart.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { call, copyExtension, installAsPersistent, launch, tempDir } from "./support/browser";
import { configure, has, readBack, sleep, visit, waitForCleanup, log } from "./support/helpers";

type Run = { ctx: BrowserContext; hooks: Page };

async function persistent(): Promise<{ profile: string; ext: string; extId: string; open: (restoreLastSession?: boolean) => Promise<Run> }> {
  const profile = tempDir("restart");
  const ext = copyExtension();
  const extId = await installAsPersistent(profile, ext);
  const open = async (restoreLastSession = false) => {
    const run = await launch(profile, ext, { loadExtension: false, extId, restoreLastSession });
    return { ctx: run.ctx, hooks: await run.hooks() };
  };
  return { profile, ext, extId, open };
}

test("TRG-07 restart with a Keep until restart site: cleaned at startup; Keep sites untouched", async () => {
  const p = await persistent();
  let { ctx, hooks } = await p.open();
  await configure(hooks, { delaySeconds: 60 });
  await call(hooks, "addRule", "*.a.test", "restart");
  await call(hooks, "addRule", "*.b.test", "keep");
  const a = await visit(ctx, hooks, "https://a.test/");
  const b = await visit(ctx, hooks, "https://b.test/");
  await a.close();
  await b.close();
  await call(hooks, "send", { type: "cleanNow" }); // a normal cleanup keeps both
  expect(await has(hooks, "first", "a.test")).toBe(true);
  expect(await has(hooks, "first", "b.test")).toBe(true);
  await ctx.close();

  ({ ctx, hooks } = await p.open());
  // (cookies have a lifetime, so Chrome itself keeps them across the restart)
  const entry = (await log(hooks)).find((e) => e.trigger === "startup") ?? (await waitForCleanup(hooks, Date.now() - 30_000));
  expect(entry.trigger).toBe("startup");
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "first", "b.test")).toBe(true);
  expect(await has(hooks, "part", "widget.test", true)).toBe(true); // embedded under kept b.test
  await ctx.close();
});

test("TRG-08 close the browser while a cleanup is pending; restart: the startup cleanup removes the pending site's data", async () => {
  const p = await persistent();
  let { ctx, hooks } = await p.open();
  await configure(hooks, { delaySeconds: 30 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  await sleep(500);
  expect((await call<Record<string, any[]>>(hooks, "sessionGet", ["scheduled"])).scheduled).toHaveLength(1);
  await ctx.close(); // the pending cleanup never runs in this session
  ({ ctx, hooks } = await p.open());
  await expect.poll(async () => (await log(hooks)).some((e) => e.trigger === "startup"), { timeout: 15_000 }).toBe(true);
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "trk", "tracker.test")).toBe(false);
  await ctx.close();
});

test("DAT-10 restart with an unkept site visited before closing: its site data is cleaned at startup from the persisted origin list", async () => {
  const p = await persistent();
  let { ctx, hooks } = await p.open();
  await configure(hooks, { delaySeconds: 60 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  const pending = (await call<Record<string, string[]>>(hooks, "rawGet", ["pendingSiteDataOrigins"])).pendingSiteDataOrigins;
  expect(pending).toContain("https://a.test");
  await ctx.close();
  ({ ctx, hooks } = await p.open());
  await expect.poll(async () => (await log(hooks)).some((e) => e.trigger === "startup"), { timeout: 15_000 }).toBe(true);
  const entry = (await log(hooks)).find((e) => e.trigger === "startup")!;
  expect(entry.sitesCleaned.find((s) => s.site === "a.test")?.siteData).toEqual(["localStorage", "indexedDB", "cacheStorage", "serviceWorkers"]);
  expect(await readBack(ctx, "https://a.test/blank")).toMatchObject({ localStorage: {}, indexedDB: [], caches: [], serviceWorkers: [] });
  await ctx.close();
});

test("TRG-09 clean open tabs at startup with reload on: restored tab's site cleaned, tab reloaded once, site no longer remembers the user", async () => {
  const p = await persistent();
  let { ctx, hooks } = await p.open();
  await configure(hooks, { cleanOpenTabsOnStartup: true, reloadAfterStartupClean: true });
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  await expect(app.locator("#state")).toHaveText("Logged in");
  await hooks.close(); // only the app.test tab is restored, not the extension's test page
  await ctx.close();

  const hitsBefore = await (await fetchHits()).json();
  ({ ctx, hooks } = await p.open(true));
  await expect.poll(async () => (await log(hooks)).some((e) => e.trigger === "startup"), { timeout: 15_000 }).toBe(true);
  const restored = ctx.pages().find((pg) => pg.url().startsWith("https://app.test/"));
  expect(restored, "app.test tab restored").toBeTruthy();
  await expect(restored!.locator("#state")).toHaveText("Logged out", { timeout: 10_000 });
  expect(await has(hooks, "session", "app.test")).toBe(false);
  await sleep(3000);
  const hitsAfter = await (await fetchHits()).json();
  const loads = (hitsAfter["app.test/"] ?? 0) - (hitsBefore["app.test/"] ?? 0);
  expect(loads, "restore + one reload").toBeLessThanOrEqual(2);
  expect(loads).toBeGreaterThanOrEqual(1);
  await ctx.close();
});

async function fetchHits(): Promise<Response> {
  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    const req = https.request({ host: "127.0.0.1", port: Number(process.env.CRUMBLE_TEST_PORT ?? 443), path: "/__hits", headers: { host: "app.test" }, rejectUnauthorized: false }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(new Response(body)));
    });
    req.on("error", reject);
    req.end();
  });
}

test("UND-03 restart the browser within 2 minutes: undo is gone and no cookie values were persisted", async () => {
  const p = await persistent();
  let { ctx, hooks } = await p.open();
  await configure(hooks);
  await call(hooks, "setCookie", { url: "https://secret.test/", name: "sid", value: "SECRET-UND03", secure: true, expirationDate: Math.floor(Date.now() / 1000) + 3600 });
  const res = await call<any>(hooks, "send", { type: "cleanNow" });
  expect(res.entry.cookiesDeleted).toBeGreaterThan(0);
  expect((await call<any>(hooks, "send", { type: "undoStatus" })).available).toBe(true);
  await ctx.close();
  ({ ctx, hooks } = await p.open());
  expect((await call<any>(hooks, "send", { type: "undoStatus" })).available).toBe(false);
  expect(JSON.stringify(await call(hooks, "sessionGet", null))).not.toContain("SECRET-UND03");
  expect(JSON.stringify(await call(hooks, "rawGet", null))).not.toContain("SECRET-UND03");
  // and nowhere in the profile's files on disk
  const { execSync } = await import("node:child_process");
  const found = execSync(`grep -rl "SECRET-UND03" "${p.profile}" || true`).toString().trim();
  expect(found, "files on disk containing the cookie value").toBe("");
  await ctx.close();
});

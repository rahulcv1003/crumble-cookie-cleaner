/** Phase B: triggers, delay and service worker resilience (no browser restarts). */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, has, log, sleep, stopServiceWorker, visit, waitForCleanup } from "./support/helpers";

test("TRG-01 close tab with a 15 s delay, worker left running: cookies gone between 15 and 20 s, not before", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { delaySeconds: 15 });
  const a = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  await sleep(14_000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  await expect.poll(() => has(hooks, "first", "a.test"), { timeout: 7000, intervals: [250] }).toBe(false);
  const elapsed = (Date.now() - t) / 1000;
  expect(elapsed).toBeGreaterThanOrEqual(15);
  expect(elapsed).toBeLessThanOrEqual(20);
});

test("TRG-02 close a tab and reopen the same site at 5 s: cookies kept", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { delaySeconds: 15 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await a.close();
  await sleep(5000);
  await visit(ctx, hooks, "https://a.test/blank");
  expect(await call<unknown[]>(hooks, "sessionGet", ["scheduled"])).toEqual({ scheduled: [] }); // cancelled
  await sleep(13_000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  expect(await log(hooks)).toEqual([]);
});

test("TRG-03 delay 120 s: runs through an alarm at about 120 s", async ({ env: { ctx, hooks } }) => {
  test.setTimeout(200_000);
  await configure(hooks, { delaySeconds: 120 });
  const a = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  await sleep(1000);
  const alarms = await call<chrome.alarms.Alarm[]>(hooks, "alarms");
  const alarm = alarms.find((x) => x.name.startsWith("cleanup:"))!;
  expect(Math.abs(alarm.scheduledTime - (t + 120_000))).toBeLessThan(2000);
  await sleep(110_000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  const entry = await waitForCleanup(hooks, t, 20_000);
  const ranAfter = (entry.time - t) / 1000;
  expect(ranAfter).toBeGreaterThanOrEqual(119);
  expect(ranAfter).toBeLessThanOrEqual(125);
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect((await call<chrome.alarms.Alarm[]>(hooks, "alarms")).filter((x) => x.name.startsWith("cleanup:"))).toEqual([]);
});

test("TRG-04 domain change on, navigate a.test -> b.test in one tab: a.test cleaned after the delay", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { cleanOnDomainChange: true, delaySeconds: 2 });
  const page = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await page.goto("https://b.test/");
  const entry = await waitForCleanup(hooks, t);
  expect(entry.trigger).toBe("domainChange");
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "first", "b.test")).toBe(true);
});

test("TRG-05 domain change on, mock login app.test -> sso.test -> app.test: still logged in", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { cleanOnDomainChange: true, delaySeconds: 2 });
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  await expect(app.locator("#state")).toHaveText("Logged in");
  await sleep(6000);
  expect(await has(hooks, "session", "app.test")).toBe(true);
  await app.reload();
  await expect(app.locator("#state")).toHaveText("Logged in");
});

test("TRG-06 domain change off, same navigation: nothing cleaned until the tab closes", async ({ env: { ctx, hooks } }) => {
  await configure(hooks, { cleanOnDomainChange: false, delaySeconds: 2 });
  const page = await visit(ctx, hooks, "https://a.test/");
  await page.goto("https://b.test/");
  await sleep(6000);
  expect(await has(hooks, "first", "a.test")).toBe(true);
  expect(await log(hooks)).toEqual([]);
  const t = Date.now();
  await page.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

test("SWR-01 stop the service worker, then close a tab: cleanup happens on time", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks, { delaySeconds: 3 });
  const a = await visit(ctx, hooks, "https://a.test/");
  await stopServiceWorker(ctx, hooks, extId);
  const t = Date.now();
  await a.close();
  const entry = await waitForCleanup(hooks, t, 12_000);
  expect((entry.time - t) / 1000).toBeLessThanOrEqual(3 + 5);
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

test("SWR-02 schedule a 15 s cleanup, stop the worker at 5 s: the alarm still runs it within 35 s", async ({ env: { ctx, hooks, extId } }) => {
  test.setTimeout(90_000);
  await configure(hooks, { delaySeconds: 15 });
  const a = await visit(ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  await sleep(5000);
  await stopServiceWorker(ctx, hooks, extId);
  const entry = await waitForCleanup(hooks, t, 40_000);
  const after = (entry.time - t) / 1000;
  expect(after).toBeGreaterThanOrEqual(15);
  expect(after).toBeLessThanOrEqual(35);
  expect(await has(hooks, "first", "a.test")).toBe(false);
});

test("SWR-03 stop the worker, open three tabs, close one: the open-site map is correct; the other two sites are kept", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks, { delaySeconds: 2 });
  await stopServiceWorker(ctx, hooks, extId);
  const a = await visit(ctx, hooks, "https://a.test/");
  await visit(ctx, hooks, "https://b.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  await stopServiceWorker(ctx, hooks, extId);
  const t = Date.now();
  await a.close();
  const entry = await waitForCleanup(hooks, t);
  expect(await has(hooks, "first", "a.test")).toBe(false);
  expect(await has(hooks, "first", "b.test")).toBe(true);
  expect(await has(hooks, "part", "widget.test", true)).toBe(true); // embedded under open b.test
  expect(await has(hooks, "session", "app.test")).toBe(true);
  expect(entry.sitesKept.map((s) => s.site)).toEqual(expect.arrayContaining(["app.test", "b.test"]));
});

test("DEC-13 (engine part) full profile at Chrome's cookie cap: progress reported while running; all non-kept cookies gone", async ({ env: { hooks } }) => {
  test.setTimeout(120_000);
  await configure(hooks);
  await call(hooks, "addRule", "h0.test", "keep");
  // Seed 10 cookies on each of 500 registrable domains; Chrome keeps about 3,200 (PRD "Test environment").
  await hooks.evaluate(async () => {
    const jobs: Promise<unknown>[] = [];
    for (let h = 0; h < 500; h++) for (let i = 0; i < 10; i++) jobs.push(chrome.cookies.set({ url: `https://h${h}.test/`, name: `c${i}`, value: "v", secure: true, sameSite: "no_restriction" }));
    await Promise.all(jobs);
  });
  const seeded = (await call<chrome.cookies.Cookie[]>(hooks, "cookies")).length;
  const keptOnH0 = (await call<chrome.cookies.Cookie[]>(hooks, "cookies")).filter((c) => c.domain === "h0.test").length;
  expect(seeded).toBeGreaterThan(3000);
  const run = call<any>(hooks, "send", { type: "cleanNow" });
  const seen: { done: number; total: number }[] = [];
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const p = (await call<Record<string, any>>(hooks, "sessionGet", ["cleanupProgress"])).cleanupProgress;
    if (p) seen.push(p);
    if (await Promise.race([run.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))])) break;
  }
  const res = await run;
  expect(seen.length).toBeGreaterThan(0);
  expect(seen[0]!.total).toBe(seeded - keptOnH0);
  expect(res.entry.cookiesDeleted).toBe(seeded - keptOnH0);
  expect(res.entry.failures).toEqual([]);
  const left = await call<chrome.cookies.Cookie[]>(hooks, "cookies");
  expect(left.length).toBe(keptOnH0);
  console.log(`DEC-13: seeded ${seeded} cookies (Chrome kept that many of 5,000); removed ${res.entry.cookiesDeleted} in ${res.entry.durationMs} ms; ${seen.length} progress readings`);
});

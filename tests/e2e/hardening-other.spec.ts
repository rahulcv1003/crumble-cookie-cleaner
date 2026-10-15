/** Phase D: performance, privacy (no network), compatibility with third-party cookies blocked. */
import { test, expect } from "@playwright/test";
import { call, DIST_TEST, launch, tempDir } from "./support/browser";
import { configure, has, openPopup, tabIdOf, visit, waitForCleanup } from "./support/helpers";
import path from "node:path";

test("PRF-01 a tab-close cleanup removing 300 cookies finishes in under 1 second", async () => {
  const run = await launch(tempDir("prf"), DIST_TEST);
  const hooks = await run.hooks();
  await configure(hooks, { delaySeconds: 1 });
  await hooks.evaluate(async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await Promise.all(Array.from({ length: 300 }, (_, i) => chrome.cookies.set({ url: `https://p${i % 30}.test/`, name: `c${i}`, value: "v", secure: true, expirationDate: exp })));
  });
  const seeded = (await call<chrome.cookies.Cookie[]>(hooks, "cookies")).filter((c) => /^p\d+\.test$/.test(c.domain)).length;
  expect(seeded).toBe(300); // confirmed by re-reading (PRD "Test environment")
  const a = await visit(run.ctx, hooks, "https://a.test/");
  const t = Date.now();
  await a.close();
  const entry = await waitForCleanup(hooks, t);
  expect(entry.cookiesDeleted).toBeGreaterThanOrEqual(300);
  expect(entry.durationMs).toBeLessThan(1000);
  console.log(`PRF-01: ${entry.cookiesDeleted} cookies in ${entry.durationMs} ms`);
  await run.ctx.close();
});

test("PRV-01 a full session makes zero network requests from any extension context", async () => {
  // Playwright reports service worker network only with this flag (set in playwright.config.ts).
  const run = await launch(tempDir("prv"), DIST_TEST);
  const offending: string[] = [];
  const isExt = (u: string | undefined) => Boolean(u && u.startsWith(`chrome-extension://${run.extId}/`));
  run.ctx.on("request", (req) => {
    const url = req.url();
    if (!/^(https?|wss?):/.test(url)) return;
    const sw = req.serviceWorker();
    const frame = sw ? undefined : (() => { try { return req.frame(); } catch { return undefined; } })();
    if ((sw && isExt(sw.url())) || (frame && isExt(frame.url()))) offending.push(url);
  });
  const hooks = await run.hooks();
  await configure(hooks, { delaySeconds: 1 });
  // Prove the monitor sees extension-page requests: one deliberate request from the test page, then reset.
  await hooks.evaluate(() => fetch("https://a.test/blank").then(() => undefined, () => undefined));
  await expect.poll(() => offending.length).toBeGreaterThan(0);
  offending.length = 0;
  // A session: browse, close tabs (automatic cleanups), popup actions, settings, import, export, undo.
  const a = await visit(run.ctx, hooks, "https://a.test/");
  await visit(run.ctx, hooks, "https://b.test/");
  const app = await visit(run.ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);
  const popup = await openPopup(run.ctx, run.extId, await tabIdOf(hooks, "https://b.test/"));
  await popup.getByRole("button", { name: "Keep", exact: true }).click();
  await popup.getByRole("button", { name: "Clean now" }).click();
  await popup.getByRole("button", { name: "Undo cleanup" }).click().catch(() => undefined);
  const settings = await run.ctx.newPage();
  await settings.goto(`chrome-extension://${run.extId}/settings.html`);
  await settings.locator("#import-file").setInputFiles(path.resolve(process.cwd(), "tests/fixtures/cad-docs-example.json"));
  await settings.getByRole("dialog").getByRole("button", { name: "Import rules" }).click();
  await Promise.all([settings.waitForEvent("download"), settings.getByRole("button", { name: "Export rules" }).click()]);
  const welcome = await run.ctx.newPage();
  await welcome.goto(`chrome-extension://${run.extId}/welcome.html`);
  await welcome.waitForTimeout(1000);
  expect(offending).toEqual([]);
  await run.ctx.close();
});

test("CMP-03 Chrome set to block third-party cookies: no errors; partitioned cleanup still works", async () => {
  const run = await launch(tempDir("cmp"), DIST_TEST, { blockThirdPartyCookies: true });
  const errors: string[] = [];
  const watch = (w: { on: (e: "console", f: (m: { type(): string; text(): string }) => void) => void }) => w.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (run.sw) watch(run.sw as never);
  const hooks = await run.hooks();
  hooks.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await configure(hooks);
  const b = await visit(run.ctx, hooks, "https://b.test/");
  // With third-party cookies blocked, Chrome still allows partitioned (CHIPS) cookies but not the plain one.
  expect(await has(hooks, "part", "widget.test", true)).toBe(true);
  expect(await has(hooks, "plain", "widget.test")).toBe(false);
  const t = Date.now();
  await b.close();
  await waitForCleanup(hooks, t);
  expect(await has(hooks, "part", "widget.test", true)).toBe(false);
  expect(errors).toEqual([]);
  await run.ctx.close();
});

test("PER-03 (automated part) Chrome's install warnings for the built manifest match docs/PERMISSIONS.md", async () => {
  const fs = await import("node:fs");
  const run = await launch(tempDir("per03"), DIST_TEST);
  const hooks = await run.hooks();
  const manifest = fs.readFileSync(path.resolve(process.cwd(), "dist/manifest.json"), "utf8");
  const warnings = await hooks.evaluate((m) => chrome.management.getPermissionWarningsByManifest(m), manifest);
  const doc = fs.readFileSync(path.resolve(process.cwd(), "docs/PERMISSIONS.md"), "utf8");
  const documented = [...doc.matchAll(/^\d+\. \*\*(.+)\*\*$/gm)].map((m) => m[1]);
  expect(warnings).toEqual(documented);
  await run.ctx.close();
});

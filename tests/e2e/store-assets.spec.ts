/**
 * Store assets (PRD "Chrome Web Store listing"): four 1280 x 800 screenshots of the real UI with a
 * caption bar, a 440 x 280 small promo tile and a 1400 x 560 marquee, written to store/.
 * Also a screenshot of the landing page for review. Run with `npm run store-assets`.
 */
import { test } from "./support/fixture";
import { call } from "./support/browser";
import { configure, openPopup, tabIdOf, visit, waitForCleanup } from "./support/helpers";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

const OUT = path.resolve(process.cwd(), "store");
const shots = path.join(OUT, "screenshots");
fs.mkdirSync(shots, { recursive: true });
const b64 = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;
const icon = fs.readFileSync(path.resolve(process.cwd(), "assets/icons/icon.svg"), "utf8");
// Light status mark for the dark caption bar.
const capMark = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#f3f4f1" stroke-width="2.2"/><path d="M6.5 17.5 17.5 6.5" stroke="#f3f4f1" stroke-width="2.2" stroke-linecap="round"/></svg>';

const FRAME = (img: string, caption: string, imgWidth: number) => `<!doctype html><html><head><style>
  html,body{margin:0;width:1280px;height:800px;background:#e7e9e5;font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif}
  .cap{height:96px;display:flex;align-items:center;gap:16px;padding:0 48px;background:#1d2126;color:#f3f4f1;font-size:30px;font-weight:600}
  .cap svg{width:40px;height:40px}
  .stage{height:704px;display:flex;align-items:center;justify-content:center}
  .stage img{width:${imgWidth}px;max-height:650px;object-fit:contain;object-position:top;border:1px solid #c8cdd0;box-shadow:0 2px 0 #c8cdd0;background:#f3f4f1}
</style></head><body><div class="cap">${capMark}<span>${caption}</span></div><div class="stage"><img src="${img}"></div></body></html>`;

async function render(ctx: BrowserContext, html: string, w: number, h: number, file: string): Promise<void> {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(html);
  await p.screenshot({ path: file });
  await p.close();
}

async function shot(page: Page, selector?: string): Promise<Buffer> {
  return selector ? page.locator(selector).screenshot() : page.screenshot();
}

test("store assets", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.github.com", "keep");
  await call(hooks, "addRule", "*.mail.example.com", "keep", { cookies: { mode: "named", names: ["session", "lang"] }, note: "Work email" });
  await call(hooks, "addRule", "*.bank.example", "keep", { note: "Bank" });
  await call(hooks, "addRule", "news.example", "restart");
  await call(hooks, "addRule", "/docs\\.(google|office)\\.com/", "keep", { siteData: { localStorage: "keep", indexedDB: "keep", cacheStorage: "clean", serviceWorkers: "clean" } });
  await call(hooks, "addRule", "*.b.test", "keep");
  // a real cleanup for the log
  await visit(ctx, hooks, "https://b.test/");
  const a = await visit(ctx, hooks, "https://a.test/");
  const app = await visit(ctx, hooks, "https://app.test/");
  await app.click("#login");
  await app.waitForURL("https://app.test/");
  const t = Date.now();
  await a.close();
  await waitForCleanup(hooks, t);

  // 1. popup on a site being cleaned
  const popup = await openPopup(ctx, extId, await tabIdOf(hooks, "https://app.test/"));
  // Render the popup at 2x pixel density so it stays sharp at a readable size in the store image.
  const popupHeight = await popup.evaluate(() => Math.ceil(document.getElementById("app")!.getBoundingClientRect().height));
  const cdp = await ctx.newCDPSession(popup);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 340, height: popupHeight, deviceScaleFactor: 2, mobile: false });
  const p1 = await popup.screenshot({ clip: { x: 0, y: 0, width: 340, height: popupHeight } });
  await render(ctx, FRAME(b64(p1), "Close a tab, and the site forgets you", 600), 1280, 800, path.join(shots, "1-popup.png"));

  // 2. the Keep list, 3. the log, 4. the import preview
  const s = await ctx.newPage();
  await s.setViewportSize({ width: 1100, height: 900 });
  await s.goto(`chrome-extension://${extId}/settings.html`);
  await s.waitForSelector("#lists");
  await render(ctx, FRAME(b64(await shot(s, "#lists")), "Keep the sites you trust, with the rules you know", 1000), 1280, 800, path.join(shots, "2-keep-list.png"));
  await s.evaluate(() => document.querySelector("details.log-entry")?.setAttribute("open", ""));
  await render(ctx, FRAME(b64(await shot(s, "#log")), "A clear record of what was kept and why", 1000), 1280, 800, path.join(shots, "3-log.png"));
  await s.evaluate(() => window.scrollTo(0, 0));
  await s.locator("#import-file").setInputFiles(path.resolve(process.cwd(), "tests/fixtures/cad-docs-example.json"));
  await s.getByRole("dialog").waitFor();
  await s.setViewportSize({ width: 1280, height: 720 });
  await render(ctx, FRAME(b64(await shot(s)), "Bring your Cookie AutoDelete lists in one step", 1150), 1280, 800, path.join(shots, "4-import.png"));

  // promo tile and marquee
  const promo = (w: number, h: number, size: number) => `<!doctype html><html><head><style>
    html,body{margin:0;width:${w}px;height:${h}px;background:#1d2126;color:#f3f4f1;font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif}
    .w{height:100%;display:flex;align-items:center;gap:${size}px;padding:0 ${size * 1.5}px}
    .w svg{width:${size * 4}px;height:${size * 4}px;flex:none}
    h1{margin:0;font-size:${size * 1.6}px;line-height:1.15;font-weight:600}
    p{margin:${size / 3}px 0 0;font-size:${size * 0.7}px;color:#c8cdd0}
  </style></head><body><div class="w">${icon.replace('fill="#1D2126"', 'fill="#2a2f35"')}<div><h1>Delete cookies when you close the tab</h1><p>Keep the sites you trust. Imports Cookie AutoDelete lists.</p></div></div></body></html>`;
  await render(ctx, promo(440, 280, 22), 440, 280, path.join(OUT, "promo-small-440x280.png"));
  await render(ctx, promo(1400, 560, 44), 1400, 560, path.join(OUT, "marquee-1400x560.png"));

  // landing page review shot
  const site = await ctx.newPage();
  await site.setViewportSize({ width: 1280, height: 900 });
  await site.goto(`file://${path.resolve(process.cwd(), "dist-site/index.html")}`);
  await site.screenshot({ path: path.join(OUT, "landing-home-review.png"), fullPage: true });
});

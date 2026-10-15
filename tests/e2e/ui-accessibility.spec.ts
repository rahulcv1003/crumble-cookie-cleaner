/** ACC-03: axe-core on every page, light and dark, with no serious or critical issues. */
import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, openPopup, tabIdOf, visit } from "./support/helpers";
import { createRequire } from "node:module";
import fs from "node:fs";
import type { Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function audit(page: Page): Promise<{ id: string; impact: string; nodes: string[] }[]> {
  // evaluate() runs through DevTools, so the extension page's CSP does not block axe.
  await page.evaluate(AXE);
  const result = await page.evaluate(async () => {
    const r = await (window as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(" ")) }));
  });
  const passes = await page.evaluate(async () => (await (window as any).axe.run(document)).passes.length);
  console.log(`axe: ${passes} rules passed; all violations: ${JSON.stringify(result.map((v: { id: string; impact: string }) => `${v.id}:${v.impact}`))}`);
  return result.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical");
}

for (const scheme of ["light", "dark"] as const) {
  test(`ACC-03 axe-core finds no serious or critical issues (${scheme})`, async ({ env: { ctx, hooks, extId } }) => {
    await configure(hooks);
    await call(hooks, "addRule", "*.b.test", "restart", { cookies: { mode: "named", names: ["sid"] }, note: "Note" });
    await visit(ctx, hooks, "https://a.test/");
    await call(hooks, "send", { type: "cleanNow" });
    const pages: [string, () => Promise<Page>][] = [
      ["popup", async () => openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"))],
      ["settings", async () => {
        const p = await ctx.newPage();
        await p.setViewportSize({ width: 1280, height: 900 });
        await p.goto(`chrome-extension://${extId}/settings.html`);
        await p.waitForSelector("#lists");
        await p.evaluate(() => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", "")));
        await p.getByRole("button", { name: "Edit *.b.test" }).click();
        return p;
      }],
      ["welcome", async () => {
        const p = await ctx.newPage();
        await call(hooks, "saveSettings", { setupComplete: false });
        await p.goto(`chrome-extension://${extId}/welcome.html`);
        await p.waitForSelector("#step1-next");
        return p;
      }],
    ];
    for (const [name, open] of pages) {
      const page = await open();
      await page.emulateMedia({ colorScheme: scheme });
      const issues = await audit(page);
      expect(issues, `${name} (${scheme})`).toEqual([]);
      await page.close();
    }
  });
}

import { test, expect } from "./support/fixture";
import { call } from "./support/browser";
import { configure, openPopup, tabIdOf, visit } from "./support/helpers";

test("help is hoverable, keyboard accessible, dismissible and never changes settings", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  const before = await call(hooks, "loadSettings");
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extId}/settings.html#cleaning`);
  const help = page.getByRole("button", { name: "Help: Automatic cleaning", exact: true });
  await help.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("manual cleanup buttons still work");
  await tooltip.hover();
  await page.waitForTimeout(300);
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await help.focus();
  await expect(help).toHaveAccessibleDescription(/manual cleanup buttons still work/);
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await call(hooks, "loadSettings")).toEqual(before);
});

test("popup help explains destructive actions and stays inside the popup", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await visit(ctx, hooks, "https://a.test/");
  const page = await openPopup(ctx, extId, await tabIdOf(hooks, "https://a.test/"));
  await page.getByRole("button", { name: "Clean this site now", exact: true }).focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("even while it is open or kept");
  await expect(tooltip).toContainText("never site data");
  const bounds = await tooltip.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  expect((await call<chrome.cookies.Cookie[]>(hooks, "cookies")).some((c) => c.domain === "a.test")).toBe(true);
});

test("settings remain usable at 380px and the local variable font loads", async ({ env: { ctx, hooks, extId } }) => {
  await configure(hooks);
  await call(hooks, "addRule", "*.example.com", "keep");
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto(`chrome-extension://${extId}/settings.html`);
  await page.waitForSelector("#lists");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].some((font) => font.family === "Inter" && font.status === "loaded"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("link", { name: "Cleaning", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cleaning", exact: true })).toHaveAttribute("aria-current", "location");
  await page.getByRole("button", { name: "Help: Clean open tabs at startup", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText("You may need to sign in again");
});

/** Smoke-test the actual production build, without the browser-test hooks. */
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { launch, tempDir } from "./support/browser";

test("production build: fresh setup, popup, settings and inspiration credit work without test hooks", async () => {
  const profile = tempDir("production");
  const { ctx, extId } = await launch(profile, path.resolve("dist"));
  const errors: string[] = [];
  ctx.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  try {
    await expect.poll(() => ctx.pages().some((page) => page.url().endsWith("/welcome.html"))).toBe(true);
    const welcome = ctx.pages().find((page) => page.url().endsWith("/welcome.html"))!;
    await welcome.click("#step1-next");
    await welcome.click("#step2-next");
    await welcome.click("#start-manual");
    await expect(welcome.locator(".finished")).toContainText("Nothing is cleaned until you click Clean now");

    const settings = await ctx.newPage();
    await settings.goto(`chrome-extension://${extId}/settings.html#about`);
    const about = settings.locator("#about");
    await expect(about).toContainText("Inspiration and thanks");
    await expect(about).toContainText("Thank you to its creators, maintainers and contributors");
    await expect(about.getByRole("link", { name: "Visit Cookie AutoDelete" })).toHaveAttribute("href", "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete");
    for (const colorScheme of ["light", "dark"] as const) {
      await settings.emulateMedia({ colorScheme });
      await expect(about.getByRole("link", { name: "Visit Cookie AutoDelete" })).toBeVisible();
    }

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await expect(popup.getByRole("switch")).not.toBeChecked();
    await expect(popup.getByRole("button", { name: "Clean now", exact: true })).toBeVisible();
    const hookResponse = await popup.goto(`chrome-extension://${extId}/test-hooks.html`).catch(() => null);
    expect(hookResponse === null || !hookResponse.ok()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

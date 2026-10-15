/** A Playwright fixture that launches a fresh profile with dist-test/ loaded, plus the test-hooks page. */
import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { DIST_TEST, launch, tempDir } from "./browser";

type Env = { ctx: BrowserContext; hooks: Page; extId: string };

export const test = base.extend<{ env: Env }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures require the object pattern
  env: async ({}, use) => {
    const run = await launch(tempDir("e2e"), DIST_TEST);
    const hooks = await run.hooks();
    await use({ ctx: run.ctx, hooks, extId: run.extId });
    await run.ctx.close();
  },
});
export { expect } from "@playwright/test";

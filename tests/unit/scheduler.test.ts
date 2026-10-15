import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { installFakeChrome, type FakeChrome } from "./fake-chrome";
import { cancelForSite, fireScheduled, getScheduled, runOverdue, scheduleCleanup, ALARM_PREFIX } from "../../src/background/scheduler";
import { resetQueueForTests } from "../../src/background/cleanup";
import { defaultSettings } from "../../src/core/settings";

let fake: FakeChrome;
/** Timers the scheduler set for exact due times; captured, not run, so tests control them. */
let timers: { ms: number; fn: () => void }[] = [];
const realSetTimeout = globalThis.setTimeout;
beforeEach(async () => {
  fake = installFakeChrome();
  resetQueueForTests();
  timers = [];
  vi.useFakeTimers({ now: 10_000_000, toFake: ["Date"] });
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
    if ((ms ?? 0) > 1000) {
      timers.push({ ms: ms ?? 0, fn });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(fn, ms);
  }) as typeof setTimeout);
  await chrome.storage.local.set({ settings: { ...defaultSettings(), setupComplete: true, autoClean: true }, rules: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const logLength = async () => (((await chrome.storage.local.get("cleanupLog")).cleanupLog as unknown[]) ?? []).length;
const settle = () => new Promise((r) => realSetTimeout(r, 120));

describe("Service worker resilience (scheduler)", () => {
  it("SWR-06 every scheduled cleanup has a matching alarm, cleared after the run", async () => {
    const short = await scheduleCleanup(["a.test"], "tabClose", 15);
    const long = await scheduleCleanup(["b.test"], "tabClose", 120);
    expect(fake.alarms.get(ALARM_PREFIX + short.id)?.scheduledTime).toBe(short.dueAt);
    expect(fake.alarms.get(ALARM_PREFIX + long.id)?.scheduledTime).toBe(long.dueAt);
    // the short one also has a timer at the exact due time; the long one has none
    expect(timers.map((t) => t.ms)).toEqual([15_000]);
    vi.setSystemTime(short.dueAt);
    timers[0]!.fn();
    await settle();
    expect(fake.alarms.has(ALARM_PREFIX + short.id)).toBe(false);
    expect(await logLength()).toBe(1);
    // the long one runs through its alarm
    vi.setSystemTime(long.dueAt);
    expect(await fireScheduled(long.id)).toBe(true);
    expect(fake.alarms.size).toBe(0);
    expect(await getScheduled()).toEqual([]);
  });

  it("a timer and its backup alarm firing together run the cleanup once", async () => {
    const e = await scheduleCleanup(["a.test"], "tabClose", 5);
    vi.setSystemTime(e.dueAt);
    const results = await Promise.all([fireScheduled(e.id), fireScheduled(e.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("on wake, overdue cleanups run (worker was stopped and its timer lost)", async () => {
    const e = await scheduleCleanup(["a.test"], "tabClose", 15);
    timers = []; // the worker stopped: timers are gone, storage and alarms remain
    vi.setSystemTime(e.dueAt + 1000);
    expect(await runOverdue()).toBe(1);
    expect(await logLength()).toBe(1);
    expect(fake.alarms.size).toBe(0);
  });

  it("triggers within the merge window share one scheduled cleanup (DEC-09 scheduling)", async () => {
    const a = await scheduleCleanup(["a.test"], "tabClose", 15);
    vi.setSystemTime(Date.now() + 800);
    const b = await scheduleCleanup(["b.test"], "tabClose", 15);
    expect(b.id).toBe(a.id);
    const list = await getScheduled();
    expect(list).toHaveLength(1);
    expect(list[0]!.sites).toEqual(["a.test", "b.test"]);
    expect(fake.alarms.size).toBe(1);
  });

  it("a site opened again before its cleanup is removed from it; an empty cleanup is cancelled with its alarm", async () => {
    const e = await scheduleCleanup(["a.test"], "tabClose", 15);
    await scheduleCleanup(["b.test"], "tabClose", 15);
    await cancelForSite("a.test");
    expect((await getScheduled())[0]!.sites).toEqual(["b.test"]);
    await cancelForSite("b.test");
    expect(await getScheduled()).toEqual([]);
    expect(fake.alarms.has(ALARM_PREFIX + e.id)).toBe(false);
    vi.setSystemTime(Date.now() + 20_000);
    for (const t of timers) t.fn();
    await settle();
    expect(await logLength()).toBe(0);
  });
});

describe("SWR-05 module-level state audit", () => {
  // No cleanup decision may read module-level variables. The only mutable module state allowed
  // is the run queue in cleanup.ts and the storage update queue in state.ts, neither of which
  // feeds a decision.
  const allowed = new Map([
    ["background/cleanup.ts", ["queue", "draining"]],
    ["background/badge.ts", ["pending", "pendingAll"]], // debounce timer for the toolbar badge (display only)
  ]);
  const root = path.resolve(__dirname, "../../src");
  const files = ["core", "background"].flatMap((d) => readdirSync(path.join(root, d)).map((f) => `${d}/${f}`)).filter((f) => f.endsWith(".ts"));

  it.each(files)("%s has no unexpected top-level mutable state", (file) => {
    const text = readFileSync(path.join(root, file), "utf8");
    const lets = [...text.matchAll(/^(?:export\s+)?(?:let|var)\s+(\w+)/gm)].map((m) => m[1]);
    expect(lets).toEqual(allowed.get(file) ?? []);
  });

  it("decide.ts, rules.ts and domains.ts are pure (no chrome.* and no storage access)", () => {
    for (const f of ["core/decide.ts", "core/rules.ts", "core/domains.ts"]) {
      expect(readFileSync(path.join(root, f), "utf8")).not.toMatch(/\bchrome\./);
    }
  });
});

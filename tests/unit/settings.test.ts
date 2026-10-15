import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  initializeStorage,
  loadRules,
  loadSettings,
  migrateSettings,
  normalizeRules,
  normalizeSettings,
  saveRules,
  saveSettings,
  type Migration,
} from "../../src/core/settings";
import { createRule } from "../../src/core/rules";
import { fakeStorage } from "./fake-storage";

let n = 0;
const id = () => `id${++n}`;

describe("Settings and storage", () => {
  it("SET-01 fresh install defaults match the PRD data model; autoClean and setupComplete are false", async () => {
    expect(defaultSettings()).toEqual({
      schema: 1,
      setupComplete: false,
      autoClean: false,
      delaySeconds: 15,
      cleanOnDomainChange: false,
      cleanDiscardedTabs: false,
      cleanOnStartup: true,
      cleanOpenTabsOnStartup: false,
      reloadAfterStartupClean: true,
      keepEmbeddedOnKeptSites: true,
      siteData: { localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true, httpCache: false },
      display: { badge: true, iconByList: true, notifyAuto: false, notifyManual: true, contextMenus: false },
    });
    // what onInstalled("install") actually writes
    const storage = fakeStorage();
    await initializeStorage(storage, "install", id, 1_700_000_000_000);
    const stored = storage.dump();
    expect(stored.settings).toEqual(defaultSettings());
    expect(stored.rules).toEqual([]);
    expect(stored.installDate).toBe(1_700_000_000_000);
    expect(await loadSettings(fakeStorage())).toEqual(defaultSettings()); // nothing stored yet
  });

  it("SET-03 migration from an older schema keeps every value and updates the schema", async () => {
    // Real path: settings written without a schema field (schema 0).
    const old = { ...defaultSettings(), autoClean: true, setupComplete: true, delaySeconds: 120, display: { ...defaultSettings().display, badge: false } } as Record<string, unknown>;
    delete old.schema;
    const r = migrateSettings(old);
    expect(r.fromSchema).toBe(0);
    expect(r.migrated).toBe(true);
    expect(r.settings.schema).toBe(1);
    expect(r.settings).toEqual({ ...defaultSettings(), autoClean: true, setupComplete: true, delaySeconds: 120, display: { ...defaultSettings().display, badge: false } });
    expect(r.resetKeys).toEqual([]);

    // Pipeline check with a renaming migration (as a future schema change would be written).
    const renamed: Migration[] = [{ from: 0, migrate: ({ delay, ...rest }) => ({ ...rest, delaySeconds: delay }) }];
    const legacy = { ...defaultSettings(), delay: 300 } as Record<string, unknown>;
    delete legacy.schema;
    delete legacy.delaySeconds;
    const r2 = migrateSettings(legacy, renamed);
    expect(r2.settings.delaySeconds).toBe(300);
    expect(r2.settings.schema).toBe(1);

    // On update, the migrated settings are written back; other keys are untouched.
    const storage = fakeStorage({ settings: old, cleanupLog: [{ t: 1 }], installDate: 5 });
    await initializeStorage(storage, "update", id, 9);
    const after = storage.dump();
    expect(after.settings).toEqual(r.settings);
    expect(after.cleanupLog).toEqual([{ t: 1 }]);
    expect(after.installDate).toBe(5);

    // A newer schema (downgrade) is not migrated, and known values are kept.
    const newer = migrateSettings({ ...defaultSettings(), schema: 7, autoClean: true });
    expect(newer.migrated).toBe(false);
    expect(newer.settings.autoClean).toBe(true);
  });

  it("SET-04 corrupt stored settings: invalid keys reset, valid keys kept, no crash", async () => {
    const corrupt = {
      schema: 1,
      setupComplete: "yes", // invalid
      autoClean: true, // valid
      delaySeconds: 0, // out of range
      cleanOnDomainChange: true, // valid
      cleanDiscardedTabs: null, // invalid
      siteData: { localStorage: false, indexedDB: 1, cacheStorage: false, extra: true },
      display: "broken",
      surprise: 42,
    };
    const r = normalizeSettings(corrupt);
    const d = defaultSettings();
    expect(r.settings).toEqual({
      ...d,
      autoClean: true,
      cleanOnDomainChange: true,
      siteData: { ...d.siteData, localStorage: false, cacheStorage: false },
    });
    expect(r.resetKeys).toEqual(expect.arrayContaining(["setupComplete", "delaySeconds", "cleanDiscardedTabs", "siteData.indexedDB", "display.badge"]));
    expect(r.droppedKeys).toEqual(expect.arrayContaining(["surprise", "siteData.extra"]));

    for (const junk of [null, undefined, 42, "x", [], [1, 2], { delaySeconds: 3601 }, { delaySeconds: 1.5 }, { delaySeconds: "15" }]) {
      expect(() => normalizeSettings(junk)).not.toThrow();
      expect(normalizeSettings(junk).settings.delaySeconds).toBe(15);
    }
    expect(normalizeSettings({ delaySeconds: 1 }).settings.delaySeconds).toBe(1);
    expect(normalizeSettings({ delaySeconds: 3600 }).settings.delaySeconds).toBe(3600);

    // Loading corrupt settings from storage repairs them without throwing.
    expect((await loadSettings(fakeStorage({ settings: corrupt }))).autoClean).toBe(true);
    // And onInstalled(update) writes the repaired version.
    const storage = fakeStorage({ settings: corrupt });
    await initializeStorage(storage, "update", id, 0);
    expect(storage.dump().settings).toEqual(r.settings);
  });

  it("saveSettings applies partial changes and rejects invalid values without writing", async () => {
    const storage = fakeStorage();
    const s = await saveSettings(storage, { autoClean: true, siteData: { httpCache: true } });
    expect(s.autoClean).toBe(true);
    expect(s.siteData).toEqual({ ...defaultSettings().siteData, httpCache: true });
    await expect(saveSettings(storage, { delaySeconds: 0 })).rejects.toThrow(/delaySeconds/);
    expect((await loadSettings(storage)).delaySeconds).toBe(15);
  });

  it("stored rules round-trip, and damaged rules are repaired to the safest values", async () => {
    const storage = fakeStorage();
    const rules = [createRule("Example.com", "keep", id, 1), createRule("*.b.com", "restart", id, 2)];
    rules[0]!.cookies = { mode: "named", names: ["sid", "lang"] };
    rules[0]!.note = "<script>alert(1)</script>";
    await saveRules(storage, rules);
    expect(await loadRules(storage, id, 0)).toEqual(rules);
    expect(rules[0]!.pattern).toBe("example.com");

    const damaged = [
      { id: "x", pattern: "a.com", list: "white", cookies: { mode: "named", names: [1] }, siteData: { localStorage: "clean", indexedDB: "maybe" }, createdAt: "now" },
      { id: "x", pattern: "b.com", list: "restart", cookies: { mode: "all" }, siteData: {}, createdAt: 3 }, // duplicate id
      { pattern: "/[a-/", list: "keep" }, // invalid regex: unusable
      "garbage",
    ];
    const r = normalizeRules(damaged, id, 99);
    expect(r.rules).toHaveLength(2);
    expect(r.rules[0]).toMatchObject({ id: "x", pattern: "a.com", list: "keep", cookies: { mode: "all" }, createdAt: 99 });
    expect(r.rules[0]!.siteData).toEqual({ localStorage: "clean", indexedDB: "keep", cacheStorage: "keep", serviceWorkers: "keep" });
    expect(r.rules[1]!.id).not.toBe("x");
    expect(r.dropped).toHaveLength(2);

    // onInstalled(update) never destroys stored entries it cannot use.
    const s2 = fakeStorage({ rules: damaged });
    await initializeStorage(s2, "update", id, 99);
    const stored = s2.dump().rules as unknown[];
    expect(stored).toHaveLength(4);
    expect(stored).toContain("garbage");
  });

  it("onInstalled(install) never overwrites existing data (reinstall with data present)", async () => {
    const existing = { ...defaultSettings(), autoClean: true, setupComplete: true };
    const storage = fakeStorage({ settings: existing, rules: [createRule("a.com", "keep", id, 1)], installDate: 7 });
    await initializeStorage(storage, "install", id, 100);
    const d = storage.dump();
    expect(d.settings).toEqual(existing);
    expect((d.rules as unknown[]).length).toBe(1);
    expect(d.installDate).toBe(7);
  });
});

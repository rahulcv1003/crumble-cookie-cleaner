/**
 * Typed settings, defaults, validation and migrations, plus the storage
 * helpers for settings and rules in chrome.storage.local.
 *
 * Storage is passed in (StorageArea-like), so the same code runs against
 * chrome.storage.local in the extension and an in-memory fake in unit tests.
 * No module-level state.
 */
import { DEFAULT_RULE_SITE_DATA, normalizePattern, validatePattern, type Rule } from "./rules";

export const SETTINGS_SCHEMA = 1 as const;

export type Settings = {
  schema: typeof SETTINGS_SCHEMA;
  setupComplete: boolean;
  autoClean: boolean;
  delaySeconds: number; // 1..3600, default 15
  cleanOnDomainChange: boolean; // default false
  cleanDiscardedTabs: boolean; // default false
  cleanOnStartup: boolean; // default true
  cleanOpenTabsOnStartup: boolean; // default false
  reloadAfterStartupClean: boolean; // default true
  keepEmbeddedOnKeptSites: boolean; // default true
  siteData: {
    localStorage: boolean;
    indexedDB: boolean;
    cacheStorage: boolean;
    serviceWorkers: boolean;
    httpCache: boolean;
  };
  display: {
    badge: boolean;
    iconByList: boolean;
    notifyAuto: boolean;
    notifyManual: boolean;
    contextMenus: boolean;
  };
};

export const DELAY_MIN_SECONDS = 1;
export const DELAY_MAX_SECONDS = 3600;

/** Returns a fresh copy of the defaults from the PRD data model. */
export function defaultSettings(): Settings {
  return {
    schema: SETTINGS_SCHEMA,
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
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const TOP_LEVEL_BOOLEANS: readonly BooleanKey[] = [
  "setupComplete",
  "autoClean",
  "cleanOnDomainChange",
  "cleanDiscardedTabs",
  "cleanOnStartup",
  "cleanOpenTabsOnStartup",
  "reloadAfterStartupClean",
  "keepEmbeddedOnKeptSites",
];
const SITE_DATA_KEYS: readonly (keyof Settings["siteData"])[] = [
  "localStorage",
  "indexedDB",
  "cacheStorage",
  "serviceWorkers",
  "httpCache",
];
const DISPLAY_KEYS: readonly (keyof Settings["display"])[] = [
  "badge",
  "iconByList",
  "notifyAuto",
  "notifyManual",
  "contextMenus",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isValidDelay(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= DELAY_MIN_SECONDS && v <= DELAY_MAX_SECONDS;
}

export type NormalizeResult = {
  settings: Settings;
  /** Dotted paths of keys that were missing or invalid and were reset to their default. */
  resetKeys: string[];
  /** Keys present in storage that are not part of Settings and were dropped. */
  droppedKeys: string[];
};

/**
 * Turns anything read from storage into valid Settings. Valid keys are kept,
 * invalid or missing keys get their default, unknown keys are dropped.
 * Never throws.
 */
export function normalizeSettings(raw: unknown): NormalizeResult {
  const d = defaultSettings();
  const resetKeys: string[] = [];
  const droppedKeys: string[] = [];
  const src = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) resetKeys.push("*");

  const out = defaultSettings();
  for (const key of TOP_LEVEL_BOOLEANS) {
    if (typeof src[key] === "boolean") out[key] = src[key] as boolean;
    else if (isRecord(raw)) resetKeys.push(key);
  }
  if (isValidDelay(src.delaySeconds)) out.delaySeconds = src.delaySeconds;
  else if (isRecord(raw)) resetKeys.push("delaySeconds");

  const sd = isRecord(src.siteData) ? src.siteData : undefined;
  for (const key of SITE_DATA_KEYS) {
    if (sd && typeof sd[key] === "boolean") out.siteData[key] = sd[key] as boolean;
    else if (isRecord(raw)) resetKeys.push(`siteData.${key}`);
  }
  const disp = isRecord(src.display) ? src.display : undefined;
  for (const key of DISPLAY_KEYS) {
    if (disp && typeof disp[key] === "boolean") out.display[key] = disp[key] as boolean;
    else if (isRecord(raw)) resetKeys.push(`display.${key}`);
  }
  if (src.schema !== SETTINGS_SCHEMA && isRecord(raw)) resetKeys.push("schema");
  out.schema = d.schema;

  const known = new Set<string>(["schema", "delaySeconds", "siteData", "display", ...TOP_LEVEL_BOOLEANS]);
  for (const key of Object.keys(src)) if (!known.has(key)) droppedKeys.push(key);
  if (sd) for (const key of Object.keys(sd)) if (!(SITE_DATA_KEYS as readonly string[]).includes(key)) droppedKeys.push(`siteData.${key}`);
  if (disp) for (const key of Object.keys(disp)) if (!(DISPLAY_KEYS as readonly string[]).includes(key)) droppedKeys.push(`display.${key}`);

  return { settings: out, resetKeys, droppedKeys };
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * A migration upgrades a stored settings object from schema `from` to `from + 1`.
 * It must copy every value it does not deliberately rename or convert.
 */
export type Migration = { from: number; migrate: (old: Record<string, unknown>) => Record<string, unknown> };

/**
 * Schema 1 is the first released schema, so there is nothing to convert yet.
 * The one real case is a settings object written without a `schema` field
 * (treated as schema 0): its values are already in schema-1 shape.
 */
export const MIGRATIONS: readonly Migration[] = [{ from: 0, migrate: (old) => ({ ...old, schema: 1 }) }];

export function storedSchemaVersion(raw: Record<string, unknown>): number {
  const s = raw.schema;
  return typeof s === "number" && Number.isInteger(s) && s >= 0 ? s : 0;
}

export type MigrateResult = NormalizeResult & { fromSchema: number; migrated: boolean };

/**
 * Brings stored settings up to the current schema, then normalises them.
 * A schema newer than this build (after a downgrade) is not migrated; it is
 * normalised, which keeps every key this build understands.
 */
export function migrateSettings(raw: unknown, migrations: readonly Migration[] = MIGRATIONS): MigrateResult {
  if (!isRecord(raw)) return { ...normalizeSettings(raw), fromSchema: 0, migrated: false };
  const fromSchema = storedSchemaVersion(raw);
  let current: Record<string, unknown> = { ...raw };
  let version = fromSchema;
  while (version < SETTINGS_SCHEMA) {
    const step = migrations.find((m) => m.from === version);
    if (!step) break;
    current = step.migrate(current);
    version += 1;
    current.schema = version;
  }
  const normalized = normalizeSettings(current);
  return { ...normalized, fromSchema, migrated: fromSchema < SETTINGS_SCHEMA };
}

// ---------------------------------------------------------------------------
// Rules: validation of stored rules
// ---------------------------------------------------------------------------

export type RulesNormalizeResult = { rules: Rule[]; dropped: unknown[]; repaired: string[] };

/**
 * Validates rules read from storage. A rule whose pattern is missing or invalid
 * cannot match anything and is dropped (and reported). Other damaged fields are
 * repaired to the safest value: list "keep", keep all cookies, keep all site data,
 * so a damaged rule never causes more data to be deleted than intended.
 */
export function normalizeRules(raw: unknown, idFactory: () => string, now: number): RulesNormalizeResult {
  const rules: Rule[] = [];
  const dropped: unknown[] = [];
  const repaired: string[] = [];
  if (!Array.isArray(raw)) return { rules, dropped: raw === undefined ? [] : [raw], repaired };
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.pattern !== "string" || validatePattern(item.pattern) !== null) {
      dropped.push(item);
      continue;
    }
    let id = typeof item.id === "string" && item.id !== "" ? item.id : "";
    if (id === "" || seenIds.has(id)) {
      id = idFactory();
      repaired.push(`${item.pattern}: id`);
    }
    seenIds.add(id);

    const list = item.list === "keep" || item.list === "restart" ? item.list : "keep";
    if (list !== item.list) repaired.push(`${item.pattern}: list`);

    let cookies: Rule["cookies"] = { mode: "all" };
    const c = item.cookies;
    if (isRecord(c) && c.mode === "named" && Array.isArray(c.names) && c.names.every((x) => typeof x === "string")) {
      cookies = { mode: "named", names: [...(c.names as string[])] };
    } else if (!(isRecord(c) && c.mode === "all")) {
      repaired.push(`${item.pattern}: cookies`);
    }

    const siteData: Rule["siteData"] = { ...DEFAULT_RULE_SITE_DATA };
    const sd = isRecord(item.siteData) ? item.siteData : {};
    for (const key of Object.keys(DEFAULT_RULE_SITE_DATA) as (keyof Rule["siteData"])[]) {
      const v = sd[key];
      if (v === "keep" || v === "clean") siteData[key] = v;
      else repaired.push(`${item.pattern}: siteData.${key}`);
    }

    const rule: Rule = {
      id,
      pattern: normalizePattern(item.pattern),
      list,
      cookies,
      siteData,
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : now,
    };
    if (typeof item.note === "string") rule.note = item.note;
    rules.push(rule);
  }
  return { rules, dropped, repaired };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** The subset of chrome.storage.StorageArea used here. */
export type KeyValueStorage = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export const STORAGE_KEYS = {
  settings: "settings",
  rules: "rules",
  installDate: "installDate",
} as const;

/** Reads settings, repairing anything invalid in memory. Does not write. */
export async function loadSettings(storage: KeyValueStorage): Promise<Settings> {
  const got = await storage.get(STORAGE_KEYS.settings);
  return migrateSettings(got[STORAGE_KEYS.settings]).settings;
}

/** Applies a partial change on top of the stored settings, validates the result and writes it. */
export async function saveSettings(
  storage: KeyValueStorage,
  change: Partial<Omit<Settings, "schema" | "siteData" | "display">> & {
    siteData?: Partial<Settings["siteData"]>;
    display?: Partial<Settings["display"]>;
  },
): Promise<Settings> {
  const current = await loadSettings(storage);
  const merged = {
    ...current,
    ...change,
    siteData: { ...current.siteData, ...(change.siteData ?? {}) },
    display: { ...current.display, ...(change.display ?? {}) },
    schema: SETTINGS_SCHEMA,
  };
  const { settings, resetKeys } = normalizeSettings(merged);
  if (resetKeys.length > 0) throw new Error(`Invalid settings value: ${resetKeys.join(", ")}`);
  await storage.set({ [STORAGE_KEYS.settings]: settings });
  return settings;
}

export async function loadRules(storage: KeyValueStorage, idFactory: () => string, now: number): Promise<Rule[]> {
  const got = await storage.get(STORAGE_KEYS.rules);
  return normalizeRules(got[STORAGE_KEYS.rules] ?? [], idFactory, now).rules;
}

export async function saveRules(storage: KeyValueStorage, rules: readonly Rule[]): Promise<void> {
  await storage.set({ [STORAGE_KEYS.rules]: rules.map((r) => ({ ...r })) });
}

export type InstallReason = "install" | "update" | "chrome_update" | "shared_module_update";

/**
 * Runs on chrome.runtime.onInstalled. On install, writes defaults and the
 * install date without touching existing keys. On update, migrates stored
 * settings and repairs stored rules, leaving every other key untouched.
 */
export async function initializeStorage(
  storage: KeyValueStorage,
  reason: InstallReason,
  idFactory: () => string,
  now: number,
): Promise<void> {
  const got = await storage.get([STORAGE_KEYS.settings, STORAGE_KEYS.rules, STORAGE_KEYS.installDate]);
  const writes: Record<string, unknown> = {};

  const migrated = migrateSettings(got[STORAGE_KEYS.settings]);
  if (got[STORAGE_KEYS.settings] === undefined || migrated.migrated || migrated.resetKeys.length > 0 || migrated.droppedKeys.length > 0) {
    writes[STORAGE_KEYS.settings] = migrated.settings;
  }

  if (got[STORAGE_KEYS.rules] === undefined) {
    writes[STORAGE_KEYS.rules] = [];
  } else {
    const normalized = normalizeRules(got[STORAGE_KEYS.rules], idFactory, now);
    if (normalized.dropped.length > 0 || normalized.repaired.length > 0) {
      // Never destroy stored user data during a migration: entries that cannot be
      // used are written back unchanged after the repaired rules; loadRules ignores them.
      writes[STORAGE_KEYS.rules] = Array.isArray(got[STORAGE_KEYS.rules])
        ? [...normalized.rules, ...normalized.dropped]
        : normalized.rules;
    }
  }

  if (reason === "install" && typeof got[STORAGE_KEYS.installDate] !== "number") {
    writes[STORAGE_KEYS.installDate] = now;
  }
  if (Object.keys(writes).length > 0) await storage.set(writes);
}

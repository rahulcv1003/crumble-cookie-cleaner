/**
 * The cleanup run (PRD "The cleanup decision" and "Requirements for deleting").
 *
 * gather -> decide -> delete in parallel batches of 100 -> re-read and verify
 * (never trust chrome.cookies.remove's return value) -> retry failures once ->
 * site data by top-level origin -> log -> undo buffer.
 *
 * Every run reads its inputs fresh from storage and chrome.tabs.query; nothing a
 * decision depends on is kept in module-level variables. The only module state is
 * the run queue, which serialises runs and merges triggers that arrive mid-run.
 */
import {
  cookieKey,
  cookieSite,
  cookieUrl,
  decideCookie,
  decideSiteData,
  SITE_DATA_TYPES,
  type CleanupKind,
  type DecisionContext,
  type KeepReason,
  type SiteDataType,
} from "../core/decide";
import { getRegistrableDomain } from "../core/domains";
import { plural, t } from "../core/i18n";
import { appendLogEntry, type LogEntry, type LogFailure, type LogSiteKept } from "../core/log";
import { compileRules } from "../core/rules";
import { loadRules, loadSettings, type Settings } from "../core/settings";
import { getOpenSites } from "./open-sites";
import { forgetOrigins, getRecordedOrigins } from "./seen-origins";
import { LOCAL, SESSION, getLocal, getSession, setLocal, setSession } from "./state";

export const BATCH_SIZE = 100;
export const PROGRESS_THRESHOLD = 300;
export const UNDO_WINDOW_MS = 2 * 60 * 1000;
export const UNDO_ALARM = "undo-expire";
/** Requests arriving within this pause before a run starts are merged into it. */
export const MERGE_PAUSE_MS = 50;

export type CleanupRequest = {
  kind: CleanupKind;
  includeOpen?: boolean;
  /** kind "site": the registrable domain to clean. */
  site?: string;
  /** kind "site": extra origins to clean site data for (for example the current tab's origin). */
  origins?: string[];
};

type Cookie = chrome.cookies.Cookie;

export type UndoBuffer = { expiresAt: number; logId: string; cookies: Cookie[] };

const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Run queue: one cleanup at a time; requests that arrive during a run merge into one follow-up.
// ---------------------------------------------------------------------------

type Queued = { request: CleanupRequest; waiters: ((entry: LogEntry | undefined) => void)[] };
let queue: Queued[] = [];
let draining = false;

function sameRun(a: CleanupRequest, b: CleanupRequest): boolean {
  if (a.kind === "site" || b.kind === "site") return a.kind === b.kind && a.site === b.site;
  // Automatic triggers and manual cleanups all sweep everything; only the flags differ.
  return a.kind === b.kind && Boolean(a.includeOpen) === Boolean(b.includeOpen);
}

/** Queues a cleanup. Resolves with its log entry (or undefined if it was skipped). */
export function requestCleanup(request: CleanupRequest): Promise<LogEntry | undefined> {
  return new Promise((resolve) => {
    const pending = queue.find((q) => sameRun(q.request, request));
    if (pending) {
      pending.waiters.push(resolve);
      if (request.origins) pending.request.origins = [...new Set([...(pending.request.origins ?? []), ...request.origins])];
    } else {
      queue.push({ request: { ...request }, waiters: [resolve] });
    }
    void drain();
  });
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      // A short pause before each run lets triggers that arrive together merge into it.
      await new Promise((r) => setTimeout(r, MERGE_PAUSE_MS));
      const next = queue.shift()!;
      let entry: LogEntry | undefined;
      try {
        entry = await runCleanup(next.request);
      } catch (e) {
        console.error("crumble:cleanup-failed", e);
        entry = undefined;
      }
      for (const w of next.waiters) w(entry);
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------
// Cookie reading and removal
// ---------------------------------------------------------------------------

async function readAllCookies(): Promise<{ storeIds: string[]; cookies: Cookie[] }> {
  const stores = await chrome.cookies.getAllCookieStores();
  const lists = await Promise.all(stores.map((s) => chrome.cookies.getAll({ storeId: s.id, partitionKey: {} })));
  return { storeIds: stores.map((s) => s.id), cookies: lists.flat() };
}

/** Removal details for one cookie; partitionKey is copied exactly when present. */
export function removalDetails(c: Cookie): chrome.cookies.CookieDetails {
  const details: chrome.cookies.CookieDetails = { url: cookieUrl(c), name: c.name, storeId: c.storeId };
  if (c.partitionKey) details.partitionKey = { ...c.partitionKey };
  return details;
}

async function removeInBatches(cookies: Cookie[], onProgress: (done: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < cookies.length; i += BATCH_SIZE) {
    const batch = cookies.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((c) => chrome.cookies.remove(removalDetails(c)).catch(() => null)));
    await onProgress(Math.min(i + BATCH_SIZE, cookies.length));
  }
}

/** Keys of the given cookies that are still present after a fresh read. */
async function stillPresent(cookies: Cookie[]): Promise<Set<string>> {
  const wanted = new Set(cookies.map(cookieKey));
  const { cookies: now } = await readAllCookies();
  return new Set(now.map(cookieKey).filter((k) => wanted.has(k)));
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export async function runCleanup(request: CleanupRequest): Promise<LogEntry> {
  const started = Date.now();
  const includeOpen = Boolean(request.includeOpen);
  const settings: Settings = await loadSettings(chrome.storage.local);
  const rules = compileRules(await loadRules(chrome.storage.local, newId, started));
  const openSites = await getOpenSites({ cleanDiscardedTabs: settings.cleanDiscardedTabs });
  const ctx: DecisionContext = { rules, openSites, kind: request.kind, includeOpen, settings };
  if (request.kind === "site") ctx.site = request.site ?? "";

  // 1. Gather and decide.
  const { storeIds, cookies } = await readAllCookies();
  const toDelete: Cookie[] = [];
  const kept = new Map<string, LogSiteKept>();
  const keepPriority: KeepReason[] = ["keepList", "keepEmbedded", "restartList", "open"];
  for (const c of cookies) {
    const d = decideCookie(c, ctx);
    if (d.action === "delete") {
      toDelete.push(c);
      continue;
    }
    if (request.kind === "site") continue; // only the cleaned site is reported
    const site = cookieSite(c);
    const prev = kept.get(site);
    if (!prev) kept.set(site, { site, reason: d.reason, cookies: 1 });
    else {
      prev.cookies += 1;
      if (keepPriority.indexOf(d.reason) < keepPriority.indexOf(prev.reason)) prev.reason = d.reason;
    }
  }

  // 2. Delete in parallel batches, with progress for large runs.
  const showProgress = toDelete.length > PROGRESS_THRESHOLD;
  const progress = async (done: number) => {
    if (showProgress) await setSession({ [SESSION.progress]: { done, total: toDelete.length, startedAt: started } });
  };
  await progress(0);
  await removeInBatches(toDelete, progress);

  // 3. Verify by re-reading; retry what is still there once; then record failures.
  let remaining = toDelete.length ? await stillPresent(toDelete) : new Set<string>();
  if (remaining.size > 0) {
    const retry = toDelete.filter((c) => remaining.has(cookieKey(c)));
    await removeInBatches(retry, async () => undefined);
    remaining = await stillPresent(retry);
  }
  const deleted = toDelete.filter((c) => !remaining.has(cookieKey(c)));
  const failed = toDelete.filter((c) => remaining.has(cookieKey(c)));
  if (showProgress) await chrome.storage.session.remove(SESSION.progress);

  // 4. Site data, by top-level origin (this also clears what embedded sites stored there).
  const recorded = await getRecordedOrigins();
  const origins = request.kind === "site"
    ? [...new Set([...recorded.filter((o) => getRegistrableDomain(new URL(o).hostname) === request.site), ...(request.origins ?? [])])]
    : recorded;
  const siteDataCtx = { ...ctx, enabled: settings.siteData, storeIds };
  const groups = new Map<string, { types: SiteDataType[]; origins: string[] }>();
  const fullyCleaned: string[] = [];
  const allEnabled = SITE_DATA_TYPES.filter((t) => settings.siteData[t]);
  const cleanedBySite = new Map<string, Set<SiteDataType>>();
  for (const origin of origins) {
    const host = new URL(origin).hostname;
    const { types, reason } = decideSiteData(host, siteDataCtx);
    if ((reason === "notKept" || reason === "siteClean") && types.length === allEnabled.length) fullyCleaned.push(origin);
    if (types.length === 0) continue;
    const key = types.join(",");
    if (!groups.has(key)) groups.set(key, { types, origins: [] });
    groups.get(key)!.origins.push(origin);
    const site = getRegistrableDomain(host);
    if (!cleanedBySite.has(site)) cleanedBySite.set(site, new Set());
    for (const t of types) cleanedBySite.get(site)!.add(t);
  }
  const failures: LogFailure[] = failed.map((c) => ({ site: cookieSite(c), cookieName: c.name, kind: "cookie" }));
  const siteDataTypesCleaned = new Set<SiteDataType>();
  for (const { types, origins: groupOrigins } of groups.values()) {
    const dataTypes: chrome.browsingData.DataTypeSet = {};
    for (const t of types) dataTypes[t] = true;
    // The HTTP cache follows the same per-origin decision when the user turned it on.
    if (settings.siteData.httpCache) dataTypes.cache = true;
    try {
      // Never cookies: they are removed one by one above, so named-cookie rules hold.
      await chrome.browsingData.remove({ origins: groupOrigins as [string, ...string[]] }, dataTypes);
      for (const t of types) siteDataTypesCleaned.add(t);
    } catch {
      for (const o of groupOrigins) failures.push({ site: getRegistrableDomain(new URL(o).hostname), kind: "siteData", types });
      for (const o of groupOrigins) fullyCleaned.splice(fullyCleaned.indexOf(o), 1);
    }
  }
  // An origin leaves the session list only when every storage type is on and cleaned; with a type
  // switched off it stays in the session list (never on disk) for the "clear existing data" offer.
  const allTypesOn = allEnabled.length === SITE_DATA_TYPES.length;
  await forgetOrigins(fullyCleaned, allTypesOn);

  // 5. Log entry (no cookie values).
  const deletedBySite = new Map<string, number>();
  for (const c of deleted) deletedBySite.set(cookieSite(c), (deletedBySite.get(cookieSite(c)) ?? 0) + 1);
  const cleanedSites = new Set([...deletedBySite.keys(), ...cleanedBySite.keys()]);
  const entry: LogEntry = {
    id: newId(),
    time: started,
    trigger: request.kind,
    includeOpen,
    durationMs: Date.now() - started,
    cookiesDeleted: deleted.length,
    sitesCleaned: [...cleanedSites].sort().map((site) => ({
      site,
      cookies: deletedBySite.get(site) ?? 0,
      siteData: SITE_DATA_TYPES.filter((t) => cleanedBySite.get(site)?.has(t)),
    })),
    sitesKept: [...kept.values()].sort((a, b) => a.site.localeCompare(b.site)),
    siteDataTypes: SITE_DATA_TYPES.filter((t) => siteDataTypesCleaned.has(t)),
    failures,
  };
  const log = await getLocal<LogEntry[]>(LOCAL.log, []);
  const writes: Record<string, unknown> = { [LOCAL.log]: appendLogEntry(log, entry) };
  const automatic = request.kind === "tabClose" || request.kind === "domainChange" || request.kind === "startup";
  if (automatic && failures.length === 0) writes[LOCAL.cleanupCount] = (await getLocal<number>(LOCAL.cleanupCount, 0)) + 1;
  await setLocal(writes);

  await notify(entry, settings, automatic);

  // 6. Undo buffer: values live only in session storage, for 2 minutes.
  if (deleted.length > 0) {
    const undo: UndoBuffer = { expiresAt: Date.now() + UNDO_WINDOW_MS, logId: entry.id, cookies: deleted };
    await setSession({ [SESSION.undo]: undo });
    await chrome.alarms.create(UNDO_ALARM, { when: undo.expiresAt });
  }
  return entry;
}

/** Notification after a cleanup, when the user turned them on (automatic: off by default; manual: on). */
async function notify(entry: LogEntry, settings: Settings, automatic: boolean): Promise<void> {
  const wanted = automatic ? settings.display.notifyAuto : settings.display.notifyManual;
  if (!wanted || !chrome.notifications) return;
  if (automatic && entry.sitesCleaned.length === 0) return;
  const message = entry.sitesCleaned.length === 0
    ? t("notifyNothingCleaned")
    : t("notifyCleaned", [plural("countSites", entry.sitesCleaned.length), plural("countCookies", entry.cookiesDeleted)]);
  try {
    await chrome.notifications.create(`cleanup-${entry.id}`, { type: "basic", iconUrl: "icons/icon-128.png", title: t("notifyTitle"), message, silent: true });
  } catch {
    // notifications can be blocked by the OS; the log still has the entry
  }
}

/**
 * Dry run for confirmations ("Delete cookies and site data for 38 sites?"): what a cleanup
 * would remove right now, without removing anything.
 */
export async function previewCleanup(request: CleanupRequest): Promise<{ sites: number; cookies: number }> {
  const now = Date.now();
  const settings = await loadSettings(chrome.storage.local);
  const rules = compileRules(await loadRules(chrome.storage.local, newId, now));
  const openSites = await getOpenSites({ cleanDiscardedTabs: settings.cleanDiscardedTabs });
  const ctx: DecisionContext = { rules, openSites, kind: request.kind, includeOpen: Boolean(request.includeOpen), settings };
  if (request.kind === "site") ctx.site = request.site ?? "";
  const { storeIds, cookies } = await readAllCookies();
  const sites = new Set<string>();
  let count = 0;
  for (const c of cookies) {
    if (decideCookie(c, ctx).action === "delete") {
      count++;
      sites.add(cookieSite(c));
    }
  }
  for (const origin of await getRecordedOrigins()) {
    const host = new URL(origin).hostname;
    if (decideSiteData(host, { ...ctx, enabled: settings.siteData, storeIds }).types.length > 0) sites.add(getRegistrableDomain(host));
  }
  return { sites: sites.size, cookies: count };
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export async function clearUndo(): Promise<void> {
  await chrome.storage.session.remove(SESSION.undo);
  await chrome.alarms.clear(UNDO_ALARM);
}

/** Drops the undo buffer if its 2 minutes are over. Called on every wake and by the alarm. */
export async function expireUndo(now = Date.now()): Promise<void> {
  const undo = await getSession<UndoBuffer | null>(SESSION.undo, null);
  if (undo && undo.expiresAt <= now) await clearUndo();
}

export async function undoAvailable(now = Date.now()): Promise<{ available: boolean; count: number; expiresAt: number }> {
  const undo = await getSession<UndoBuffer | null>(SESSION.undo, null);
  if (!undo || undo.expiresAt <= now) return { available: false, count: 0, expiresAt: 0 };
  return { available: true, count: undo.cookies.length, expiresAt: undo.expiresAt };
}

/** Details to recreate a deleted cookie with chrome.cookies.set. */
export function restoreDetails(c: Cookie): chrome.cookies.SetDetails {
  const d: chrome.cookies.SetDetails = {
    url: cookieUrl(c),
    name: c.name,
    value: c.value,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    storeId: c.storeId,
  };
  if (!c.hostOnly) d.domain = c.domain;
  if (!c.session && c.expirationDate !== undefined) d.expirationDate = c.expirationDate;
  if (c.partitionKey) d.partitionKey = { ...c.partitionKey };
  return d;
}

/**
 * Restores the last cleanup's cookies, then re-reads and reports how many really exist
 * again (Chrome can silently drop cookies at its limits). The buffer is cleared afterwards.
 */
export async function restoreUndo(now = Date.now()): Promise<{ restored: number; attempted: number; expired: boolean }> {
  const undo = await getSession<UndoBuffer | null>(SESSION.undo, null);
  if (!undo || undo.expiresAt <= now) {
    await clearUndo();
    return { restored: 0, attempted: 0, expired: true };
  }
  for (let i = 0; i < undo.cookies.length; i += BATCH_SIZE) {
    await Promise.all(undo.cookies.slice(i, i + BATCH_SIZE).map((c) => chrome.cookies.set(restoreDetails(c)).catch(() => null)));
  }
  const present = await stillPresent(undo.cookies);
  await clearUndo();
  return { restored: present.size, attempted: undo.cookies.length, expired: false };
}

/** For tests: whether a cleanup is running or queued. */
export function isIdle(): boolean {
  return !draining && queue.length === 0;
}

/** For tests: resets the run queue between unit tests. */
export function resetQueueForTests(): void {
  queue = [];
  draining = false;
}

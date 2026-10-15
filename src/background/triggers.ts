/**
 * Event handlers: tab close, domain change, startup, alarms, keyboard command and
 * messages from the extension's pages. index.ts registers them at the top level.
 */
import { CONFIG, isSet } from "../config";
import { cookieSite, decideSiteData, type SiteDataType } from "../core/decide";
import { getRegistrableDomain } from "../core/domains";
import { toUnicodeHost } from "../core/hosts";
import type { LogEntry } from "../core/log";
import type { Message, PopupState, SetupCandidates } from "../core/messages";
import { compileRules } from "../core/rules";
import { loadRules, loadSettings, saveSettings } from "../core/settings";
import { expireUndo, previewCleanup, requestCleanup, restoreUndo, undoAvailable, clearUndo, UNDO_ALARM } from "./cleanup";
import { getOpenSites } from "./open-sites";
import { getRecordedOrigins } from "./seen-origins";
import { getSiteStatus, keepSite, removeSite } from "./site-status";
import { LOCAL, SESSION, getLocal, getSession } from "./state";
import { ALARM_PREFIX, cancelForSite, fireScheduled, runOverdue, scheduleCleanup } from "./scheduler";
import { removeTab, setTabUrl, syncOpenTabs } from "./seen-origins";
import { webHost } from "./state";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RATING_MIN_DAYS = 14;
export const RATING_MIN_CLEANUPS = 30;

const siteOf = (url: string | undefined): string | null => {
  const host = webHost(url);
  return host ? getRegistrableDomain(host) : null;
};

/** Runs on every service worker start: rebuild the tab map, run overdue cleanups, expire undo. */
export async function onWake(): Promise<void> {
  await syncOpenTabs();
  await expireUndo();
  await runOverdue();
}

export async function onTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const url = tab.url || tab.pendingUrl;
  await setTabUrl(tab.id, url);
  const site = siteOf(url);
  if (site) await cancelForSite(site);
}

export async function onTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): Promise<void> {
  const url = changeInfo.url ?? (changeInfo.status === "complete" ? tab.url : undefined);
  if (!url) return;
  const newSite = siteOf(url);
  const prevUrl = await setTabUrl(tabId, url);
  if (!newSite) return;
  await cancelForSite(newSite);
  const prevSite = siteOf(prevUrl);
  if (prevSite && prevSite !== newSite) {
    const settings = await loadSettings(chrome.storage.local);
    if (settings.autoClean && settings.cleanOnDomainChange) await scheduleCleanup([prevSite], "domainChange", settings.delaySeconds);
  }
}

export async function onTabRemoved(tabId: number): Promise<void> {
  const url = await removeTab(tabId);
  const site = siteOf(url);
  if (!site) return;
  const settings = await loadSettings(chrome.storage.local);
  if (settings.autoClean) await scheduleCleanup([site], "tabClose", settings.delaySeconds);
}

export async function onTabReplaced(addedTabId: number, removedTabId: number): Promise<void> {
  await removeTab(removedTabId);
  try {
    const tab = await chrome.tabs.get(addedTabId);
    await setTabUrl(addedTabId, tab.url || tab.pendingUrl);
  } catch {
    // tab already gone
  }
}

export async function onStartup(): Promise<void> {
  const settings = await loadSettings(chrome.storage.local);
  await syncOpenTabs();
  if (!settings.autoClean || !settings.cleanOnStartup) return;
  await requestCleanup({ kind: "startup", includeOpen: settings.cleanOpenTabsOnStartup });
  if (settings.cleanOpenTabsOnStartup && settings.reloadAfterStartupClean) {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.filter((t) => t.id !== undefined && webHost(t.url || t.pendingUrl)).map((t) => chrome.tabs.reload(t.id!).catch(() => undefined)),
    );
  }
}

export async function onAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name.startsWith(ALARM_PREFIX)) await fireScheduled(alarm.name.slice(ALARM_PREFIX.length));
  else if (alarm.name === UNDO_ALARM) await clearUndo();
}

export async function onCommand(command: string): Promise<void> {
  if (command === "clean-now") await requestCleanup({ kind: "manual" });
}

export async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "cleanNow":
      return { ok: true, entry: (await requestCleanup({ kind: "manual" })) ?? null };
    case "cleanIncludingOpen":
      return { ok: true, entry: (await requestCleanup({ kind: "manual", includeOpen: true })) ?? null };
    case "cleanSite": {
      const site = getRegistrableDomain(message.site);
      return { ok: true, entry: (await requestCleanup({ kind: "site", site, origins: message.origin ? [message.origin] : [] })) ?? null };
    }
    case "undo":
      return { ok: true, ...(await restoreUndo()) };
    case "undoStatus":
      await expireUndo();
      return { ok: true, ...(await undoAvailable()) };
    case "previewClean":
      return { ok: true, ...(await previewCleanup({ kind: "manual", includeOpen: message.includeOpen })) };
    case "popupState":
      return { ok: true, state: await popupState(message.url, message.tabId) };
    case "keepSite":
      await keepSite(message.host, message.list);
      return { ok: true };
    case "removeSite":
      await removeSite(message.host);
      return { ok: true };
    case "setAutoClean":
      await saveSettings(chrome.storage.local, { autoClean: message.on });
      return { ok: true };
    case "setupCandidates":
      return { ok: true, candidates: await setupCandidates() };
    case "rating":
      await chrome.storage.local.set({ ratingPrompt: "done" });
      if (message.action === "open" && isSet(CONFIG.storeReviewUrl)) await chrome.tabs.create({ url: CONFIG.storeReviewUrl });
      return { ok: true };
    case "siteDataOffer":
      return { ok: true, count: (await uncleanedOrigins(message.dataType)).length };
    case "clearSiteDataType": {
      const origins = await uncleanedOrigins(message.dataType);
      if (origins.length > 0) await chrome.browsingData.remove({ origins: origins as [string, ...string[]] }, { [message.dataType]: true });
      return { ok: true, count: origins.length };
    }
    default:
      return { ok: false, error: "unknown-message" };
  }
}

async function popupState(url: string | undefined, tabId: number | undefined): Promise<PopupState> {
  const [settings, status, log, undo, progress] = await Promise.all([
    loadSettings(chrome.storage.local),
    getSiteStatus(url, tabId),
    getLocal<LogEntry[]>(LOCAL.log, []),
    (async () => {
      await expireUndo();
      return undoAvailable();
    })(),
    getSession<{ done: number; total: number } | null>(SESSION.progress, null),
  ]);
  return { status, setupComplete: settings.setupComplete, autoClean: settings.autoClean, last: log[0] ?? null, undo, progress, showRating: await shouldShowRating() };
}

/** One rating request after at least 14 days and 30 successful automatic cleanups; never again once answered. */
async function shouldShowRating(now = Date.now()): Promise<boolean> {
  if (!isSet(CONFIG.storeReviewUrl)) return false;
  const got = await chrome.storage.local.get(["installDate", LOCAL.cleanupCount, "ratingPrompt"]);
  const installed = typeof got.installDate === "number" ? got.installDate : now;
  return got.ratingPrompt !== "done" && now - installed >= RATING_MIN_DAYS * DAY_MS && Number(got[LOCAL.cleanupCount] ?? 0) >= RATING_MIN_CLEANUPS;
}

/** Setup step one: sites open now, and the sites currently holding the most cookies. */
async function setupCandidates(): Promise<SetupCandidates> {
  const open = await getOpenSites({ cleanDiscardedTabs: false });
  const openSites = [...new Set([...open.values()].flatMap((s) => [...s]))].sort();
  const counts = new Map<string, number>();
  for (const c of await chrome.cookies.getAll({ partitionKey: {} })) counts.set(cookieSite(c), (counts.get(cookieSite(c)) ?? 0) + 1);
  const top = [...counts.entries()]
    .filter(([site]) => !openSites.includes(site))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([site, cookies]) => ({ site, label: toUnicodeHost(site), cookies }));
  return { open: openSites.map((site) => ({ site, label: toUnicodeHost(site) })), top };
}

/** Recorded origins whose site is neither kept nor open: the ones "clear existing data" would clean. */
async function uncleanedOrigins(dataType: SiteDataType): Promise<string[]> {
  const settings = await loadSettings(chrome.storage.local);
  const rules = compileRules(await loadRules(chrome.storage.local, () => crypto.randomUUID(), Date.now()));
  const openSites = await getOpenSites({ cleanDiscardedTabs: settings.cleanDiscardedTabs });
  const enabled = { localStorage: false, indexedDB: false, cacheStorage: false, serviceWorkers: false, httpCache: false, [dataType]: true };
  const origins = await getRecordedOrigins();
  return origins.filter((o) => decideSiteData(new URL(o).hostname, { rules, openSites, kind: "manual", includeOpen: false, settings, enabled, storeIds: ["0"] }).types.includes(dataType));
}

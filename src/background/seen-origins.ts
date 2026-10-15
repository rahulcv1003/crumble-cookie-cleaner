/**
 * Tab URL map and the list of top-level origins seen this session.
 *
 * - tabUrls (session): the last http(s) URL of each tab, so onRemoved knows which site closed.
 * - seenOrigins (session) and pendingSiteDataOrigins (local): top-level origins (scheme, host,
 *   port; no path or query) whose site data may need cleaning. The local copy lets the startup
 *   cleanup clean sites visited before a restart. An origin is removed from both once cleaned.
 */
import { LOCAL, SESSION, getLocal, getSession, setLocal, setSession, webOrigin, withLock } from "./state";

type TabUrls = Record<string, string>;

export async function getTabUrls(): Promise<TabUrls> {
  return getSession<TabUrls>(SESSION.tabUrls, {});
}

/** Adds origins to both lists (no-op for ones already present). */
export function recordOrigins(origins: readonly string[]): Promise<void> {
  if (origins.length === 0) return Promise.resolve();
  return withLock("origins", async () => {
  const [seen, pending] = await Promise.all([getSession<string[]>(SESSION.seenOrigins, []), getLocal<string[]>(LOCAL.pendingSiteData, [])]);
  const newSeen = origins.filter((o) => !seen.includes(o));
  const newPending = origins.filter((o) => !pending.includes(o));
  if (newSeen.length) await setSession({ [SESSION.seenOrigins]: [...seen, ...newSeen] });
  if (newPending.length) await setLocal({ [LOCAL.pendingSiteData]: [...pending, ...newPending] });
  });
}

export async function getRecordedOrigins(): Promise<string[]> {
  const [seen, pending] = await Promise.all([getSession<string[]>(SESSION.seenOrigins, []), getLocal<string[]>(LOCAL.pendingSiteData, [])]);
  return [...new Set([...seen, ...pending])];
}

/**
 * Removes cleaned origins. `sessionToo: false` keeps them in the session list only, used when
 * a site data type is switched off and may still hold data: the "clear existing data" offer can
 * then find them this session, while nothing about them stays on disk.
 */
export function forgetOrigins(origins: readonly string[], sessionToo = true): Promise<void> {
  if (origins.length === 0) return Promise.resolve();
  return withLock("origins", async () => {
  const drop = new Set(origins);
  const [seen, pending] = await Promise.all([getSession<string[]>(SESSION.seenOrigins, []), getLocal<string[]>(LOCAL.pendingSiteData, [])]);
  await Promise.all([
    sessionToo ? setSession({ [SESSION.seenOrigins]: seen.filter((o) => !drop.has(o)) }) : Promise.resolve(),
    setLocal({ [LOCAL.pendingSiteData]: pending.filter((o) => !drop.has(o)) }),
  ]);
  });
}

/** Records a tab's current URL. Returns the previous URL for that tab (for domain-change detection). */
export async function setTabUrl(tabId: number, url: string | undefined): Promise<string | undefined> {
  const origin = webOrigin(url);
  const prev = await withLock("tabs", async () => {
    const map = await getTabUrls();
    const before = map[String(tabId)];
    if (origin && url && before !== url) {
      map[String(tabId)] = url;
      await setSession({ [SESSION.tabUrls]: map });
    }
    return before;
  });
  if (origin) await recordOrigins([origin]);
  return prev;
}

export function removeTab(tabId: number): Promise<string | undefined> {
  return withLock("tabs", async () => {
    const map = await getTabUrls();
    const prev = map[String(tabId)];
    if (prev !== undefined) {
      delete map[String(tabId)];
      await setSession({ [SESSION.tabUrls]: map });
    }
    return prev;
  });
}

/**
 * Adds every open http(s) tab to the map and the origin lists. Runs on every
 * worker wake, so state is correct even after the worker was stopped.
 * Entries for tabs that no longer exist are kept until their onRemoved event
 * (Chrome queues it), except at startup, when the map is empty anyway.
 */
export async function syncOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const origins: string[] = [];
  await withLock("tabs", async () => {
  const map = await getTabUrls();
  let changed = false;
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const url = tab.url || tab.pendingUrl;
    const origin = webOrigin(url);
    if (!origin || !url) continue;
    origins.push(origin);
    if (map[String(tab.id)] !== url) {
      map[String(tab.id)] = url;
      changed = true;
    }
  }
  if (changed) await setSession({ [SESSION.tabUrls]: map });
  });
  await recordOrigins([...new Set(origins)]);
}

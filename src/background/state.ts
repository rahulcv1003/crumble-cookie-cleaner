/**
 * Storage keys used by the service worker, and small typed helpers.
 * chrome.storage.session: never written to disk, cleared when the browser closes.
 * chrome.storage.local: survives restarts and updates.
 */
export const SESSION = {
  tabUrls: "tabUrls", // Record<tabId, url> of http(s) tabs, so a closed tab's site is known
  seenOrigins: "seenOrigins", // top-level origins seen this session
  scheduled: "scheduled", // ScheduledCleanup[]
  undo: "undo", // UndoBuffer (cookie values; 2 minutes)
  progress: "cleanupProgress", // { done, total, startedAt } while a large cleanup runs
} as const;

export const LOCAL = {
  pendingSiteData: "pendingSiteDataOrigins", // origins still waiting for site data cleanup (survives restart)
  log: "cleanupLog",
  cleanupCount: "cleanupCount", // successful automatic cleanups (rating prompt)
} as const;

export async function getSession<T>(key: string, fallback: T): Promise<T> {
  const got = await chrome.storage.session.get(key);
  return (got[key] as T | undefined) ?? fallback;
}
export async function setSession(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.session.set(items);
}
export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const got = await chrome.storage.local.get(key);
  return (got[key] as T | undefined) ?? fallback;
}
export async function setLocal(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(items);
}

/** The origin of an http(s) URL ("https://a.test"), or null for anything else. */
export function webOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}
export function webHost(url: string | undefined): string | null {
  const origin = webOrigin(url);
  return origin ? new URL(origin).hostname : null;
}

/**
 * Serialises read-modify-write updates to one storage key group within this worker,
 * so two events arriving together cannot overwrite each other's changes.
 * This is only a queue; no cleanup decision reads it.
 */
const chains = new Map<string, Promise<unknown>>();
export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(name, next.catch(() => undefined));
  return next;
}

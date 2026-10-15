/**
 * Scheduled cleanups (PRD "Triggers" -> "Delay").
 *
 * Each scheduled cleanup lives in chrome.storage.session with its due time and the
 * sites it was scheduled for. Every one gets a chrome.alarms alarm (this is what
 * survives the worker stopping). Delays under 30 seconds also get a setTimeout for
 * the exact due time; if the worker stops first, the alarm runs it instead.
 * On every wake, overdue cleanups run. A site that opens again before its cleanup
 * runs is removed from it; a cleanup with no sites left is cancelled.
 */
import { requestCleanup } from "./cleanup";
import { SESSION, getSession, setSession, withLock } from "./state";

export type ScheduledCleanup = {
  id: string;
  dueAt: number;
  sites: string[];
  kind: "tabClose" | "domainChange";
};

export const ALARM_PREFIX = "cleanup:";
/** Scheduling requests whose due times fall within this window share one cleanup. */
export const MERGE_WINDOW_MS = 2000;
const TIMER_LIMIT_MS = 30_000;

const newId = () => crypto.randomUUID();

export function getScheduled(): Promise<ScheduledCleanup[]> {
  return getSession<ScheduledCleanup[]>(SESSION.scheduled, []);
}

/** Schedules (or merges into) a cleanup for these sites after delaySeconds. */
export async function scheduleCleanup(sites: string[], kind: ScheduledCleanup["kind"], delaySeconds: number, now = Date.now()): Promise<ScheduledCleanup> {
  const dueAt = now + delaySeconds * 1000;
  const entry = await withLock("scheduled", async () => {
    const list = await getScheduled();
    let e = list.find((x) => Math.abs(x.dueAt - dueAt) <= MERGE_WINDOW_MS);
    if (e) {
      e.sites = [...new Set([...e.sites, ...sites])];
      e.dueAt = Math.max(e.dueAt, dueAt);
      if (e.kind !== kind) e.kind = "tabClose";
    } else {
      e = { id: newId(), dueAt, sites: [...new Set(sites)], kind };
      list.push(e);
    }
    await setSession({ [SESSION.scheduled]: list });
    return { ...e };
  });
  await chrome.alarms.create(ALARM_PREFIX + entry.id, { when: entry.dueAt });
  const wait = entry.dueAt - Date.now();
  if (wait < TIMER_LIMIT_MS) setTimeout(() => void fireScheduled(entry.id), Math.max(0, wait));
  return entry;
}

/** Runs a scheduled cleanup if it still exists and is due. Safe to call twice (timer and alarm). */
export async function fireScheduled(id: string, now = Date.now()): Promise<boolean> {
  const entry = await withLock("scheduled", async () => {
    const list = await getScheduled();
    const e = list.find((x) => x.id === id);
    if (!e) return null;
    if (e.dueAt > now + 250) return "early" as const;
    await setSession({ [SESSION.scheduled]: list.filter((x) => x.id !== id) });
    return e;
  });
  if (entry === "early") {
    // A merged cleanup moved later: wait for its new due time.
    const list = await getScheduled();
    const e = list.find((x) => x.id === id);
    if (e) {
      const wait = e.dueAt - Date.now();
      if (wait < TIMER_LIMIT_MS) setTimeout(() => void fireScheduled(id), Math.max(0, wait));
    }
    return false;
  }
  await chrome.alarms.clear(ALARM_PREFIX + id);
  if (!entry) return false;
  await requestCleanup({ kind: entry.kind });
  return true;
}

/** Runs every overdue scheduled cleanup. Called on every worker wake. */
export async function runOverdue(now = Date.now()): Promise<number> {
  const list = await getScheduled();
  const due = list.filter((x) => x.dueAt <= now);
  await Promise.all(due.map((x) => fireScheduled(x.id, now)));
  return due.length;
}

/** A site became open again: remove it from pending cleanups; cancel those left with no sites. */
export async function cancelForSite(site: string): Promise<void> {
  const cancelled = await withLock("scheduled", async () => {
    const list = await getScheduled();
    const keep: ScheduledCleanup[] = [];
    const gone: string[] = [];
    let changed = false;
    for (const e of list) {
      if (!e.sites.includes(site)) {
        keep.push(e);
        continue;
      }
      changed = true;
      const sites = e.sites.filter((s) => s !== site);
      if (sites.length === 0) gone.push(e.id);
      else keep.push({ ...e, sites });
    }
    if (changed) await setSession({ [SESSION.scheduled]: keep });
    return gone;
  });
  await Promise.all(cancelled.map((id) => chrome.alarms.clear(ALARM_PREFIX + id)));
}

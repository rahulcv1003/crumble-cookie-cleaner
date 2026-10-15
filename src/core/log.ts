/**
 * Cleanup log entries (PRD "Cleanup log and undo"). The log never stores cookie values.
 */
import type { CleanupKind, KeepReason, SiteDataType } from "./decide";

export const LOG_MAX_ENTRIES = 50;

export type LogSiteCleaned = { site: string; cookies: number; siteData: SiteDataType[] };
export type LogSiteKept = { site: string; reason: KeepReason; cookies: number };
export type LogFailure = { site: string; cookieName: string; kind: "cookie" } | { site: string; kind: "siteData"; types: SiteDataType[] };

export type LogEntry = {
  id: string;
  time: number;
  trigger: CleanupKind;
  includeOpen: boolean;
  durationMs: number;
  cookiesDeleted: number;
  sitesCleaned: LogSiteCleaned[];
  sitesKept: LogSiteKept[];
  siteDataTypes: SiteDataType[];
  failures: LogFailure[];
};

/** Adds an entry at the front and keeps only the newest LOG_MAX_ENTRIES. */
export function appendLogEntry(log: readonly LogEntry[], entry: LogEntry, max = LOG_MAX_ENTRIES): LogEntry[] {
  return [entry, ...log].slice(0, max);
}

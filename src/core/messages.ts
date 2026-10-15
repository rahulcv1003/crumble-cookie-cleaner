/**
 * Typed messages between extension pages (popup, settings, welcome) and the service worker.
 * The worker only accepts messages from this extension's own pages.
 */
import type { LogEntry } from "./log";
import type { ListType } from "./rules";
import type { SiteDataType } from "./site-data";

export type Message =
  | { type: "cleanNow" }
  | { type: "cleanIncludingOpen" }
  | { type: "cleanSite"; site: string; origin?: string }
  | { type: "previewClean"; includeOpen: boolean }
  | { type: "undo" }
  | { type: "undoStatus" }
  | { type: "popupState"; url?: string; tabId?: number }
  | { type: "keepSite"; host: string; list: ListType }
  | { type: "removeSite"; host: string }
  | { type: "setAutoClean"; on: boolean }
  | { type: "setupCandidates" }
  | { type: "rating"; action: "open" | "dismiss" }
  | { type: "siteDataOffer"; dataType: SiteDataType }
  | { type: "clearSiteDataType"; dataType: SiteDataType };

export type PopupState = {
  status: import("../background/site-status").SiteStatus;
  setupComplete: boolean;
  autoClean: boolean;
  last: LogEntry | null;
  undo: { available: boolean; count: number; expiresAt: number };
  progress: { done: number; total: number } | null;
  showRating: boolean;
};

export type SetupCandidates = { open: { site: string; label: string }[]; top: { site: string; label: string; cookies: number }[] };

/**
 * Toolbar icon and badge for each tab (PRD "Toolbar icon and badge").
 * Icon: the status mark (full / half / struck / dotted square), greyscale when automatic
 * cleaning is off, or the product icon when "icon colour by list" is off.
 * Badge: the site's cookie count, partitioned cookies under it included.
 */
import { loadSettings } from "../core/settings";
import { getSiteStatus } from "./site-status";

function iconPaths(name: string): Record<string, string> {
  return { "16": `icons/${name}-16.png`, "32": `icons/${name}-32.png` };
}

export async function updateTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const settings = await loadSettings(chrome.storage.local);
  const status = await getSiteStatus(tab.url || tab.pendingUrl, tab.id);
  const off = !settings.autoClean;
  let icon: string;
  if (!settings.display.iconByList) icon = off ? "icon-off" : "icon";
  else {
    const mark = !status.web ? "none" : status.list === "keep" ? "keep" : status.list === "restart" ? "restart" : "clean";
    icon = `status-${mark}${off ? "-off" : ""}`;
  }
  const text = settings.display.badge && status.web && status.cookies > 0 ? (status.cookies > 999 ? "999+" : String(status.cookies)) : "";
  try {
    await Promise.all([
      // Which icon is shown, per tab: Chrome can't report it back, so the popup tests read it here.
      chrome.storage.session.set({ [`icon:${tab.id}`]: icon }),
      chrome.action.setIcon({ tabId: tab.id, path: iconPaths(icon) }),
      chrome.action.setBadgeText({ tabId: tab.id, text }),
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#4A5056" }),
      chrome.action.setBadgeTextColor?.({ tabId: tab.id, color: "#FFFFFF" }),
    ]);
  } catch {
    // the tab closed meanwhile
  }
}

/** Updates the active tab of every window (tab switches, cookie changes). */
export async function updateActiveTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(tabs.map(updateTab));
}

/** Updates every tab (after a rule or setting change, every tab's icon may be out of date). */
export async function updateAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await updateTab(tab);
}

let pending: ReturnType<typeof setTimeout> | undefined;
let pendingAll = false;
/** Coalesces bursts (for example cookie changes during a page load) into one update. Display only. */
export function scheduleBadgeUpdate(delayMs = 300, allTabs = false): void {
  if (pending !== undefined) clearTimeout(pending);
  pendingAll = pendingAll || allTabs;
  pending = setTimeout(() => {
    const all = pendingAll;
    pending = undefined;
    pendingAll = false;
    void (all ? updateAllTabs() : updateActiveTabs()).catch(() => undefined);
  }, delayMs);
}

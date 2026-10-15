/** Context menu entries (off by default; turned on in settings, Display section). */
import { getRegistrableDomain } from "../core/domains";
import { t } from "../core/i18n";
import { loadSettings } from "../core/settings";
import { requestCleanup } from "./cleanup";
import { keepSite } from "./site-status";
import { webHost, webOrigin } from "./state";

const ITEMS = [
  { id: "keep", title: "menuKeepSite" },
  { id: "restart", title: "menuKeepSiteUntilRestart" },
  { id: "clean", title: "menuCleanSiteNow" },
] as const;

export async function syncContextMenus(): Promise<void> {
  const settings = await loadSettings(chrome.storage.local);
  await chrome.contextMenus.removeAll();
  if (!settings.display.contextMenus) return;
  for (const item of ITEMS) {
    chrome.contextMenus.create({ id: item.id, title: t(item.title), contexts: ["page", "action"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
  }
}

export async function onMenuClicked(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const url = info.pageUrl || tab?.url;
  const host = webHost(url);
  if (!host) return;
  if (info.menuItemId === "keep") await keepSite(host, "keep");
  else if (info.menuItemId === "restart") await keepSite(host, "restart");
  else if (info.menuItemId === "clean") {
    const origin = webOrigin(url);
    await requestCleanup({ kind: "site", site: getRegistrableDomain(host), origins: origin ? [origin] : [] });
  }
}

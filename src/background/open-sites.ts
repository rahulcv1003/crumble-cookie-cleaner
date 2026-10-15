/**
 * The open-site map, rebuilt from chrome.tabs.query({}) at the start of every
 * cleanup (PRD "What counts as in use"). Never cached between events.
 */
import { getRegistrableDomain } from "../core/domains";
import { webHost } from "./state";

export type OpenSites = Map<string, Set<string>>; // cookie store id -> registrable domains open in it

export async function getOpenSites(opts: { cleanDiscardedTabs: boolean }): Promise<OpenSites> {
  const [tabs, stores] = await Promise.all([chrome.tabs.query({}), chrome.cookies.getAllCookieStores()]);
  const storeOfTab = new Map<number, string>();
  for (const store of stores) for (const id of store.tabIds) storeOfTab.set(id, store.id);
  const incognitoStores = stores.map((s) => s.id).filter((id) => id !== "0");

  const open: OpenSites = new Map(stores.map((s) => [s.id, new Set<string>()]));
  const add = (storeId: string, site: string) => {
    if (!open.has(storeId)) open.set(storeId, new Set());
    open.get(storeId)!.add(site);
  };
  for (const tab of tabs) {
    if (tab.discarded && opts.cleanDiscardedTabs) continue;
    const host = webHost(tab.url) ?? webHost(tab.pendingUrl);
    if (!host) continue;
    const site = getRegistrableDomain(host);
    const storeId = tab.id !== undefined ? storeOfTab.get(tab.id) : undefined;
    if (storeId) add(storeId, site);
    else if (tab.incognito) for (const id of incognitoStores) add(id, site);
    else add("0", site);
  }
  return open;
}

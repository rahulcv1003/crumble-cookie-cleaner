/**
 * What the popup, badge and toolbar icon show for a tab: the site, its list, its cookie
 * count (partitioned cookies under it included), and which rules "Remove from list" can remove.
 * The status uses the same rule matching as the cleanup decision.
 */
import { cookieSite } from "../core/decide";
import { getRegistrableDomain } from "../core/domains";
import { normalizeHost, toUnicodeHost } from "../core/hosts";
import { classifyHost, compileRules, createRule, isRegexPattern, type ListType, type Rule } from "../core/rules";
import { loadRules, saveRules } from "../core/settings";
import { webHost, webOrigin } from "./state";

export type SiteStatus =
  | { web: false }
  | {
      web: true;
      host: string;
      site: string;
      siteLabel: string;
      origin: string;
      list: ListType | null;
      cookies: number;
      matching: { id: string; pattern: string; list: ListType }[];
      removable: string[];
    };

const newId = () => crypto.randomUUID();

/** A rule "Remove from list" may delete: a plain or *. pattern naming exactly this site (not a regex, not a broad wildcard). */
export function isRemovableFor(rule: Rule, host: string, site: string): boolean {
  if (isRegexPattern(rule.pattern)) return false;
  const body = rule.pattern.replace(/^\*\./, "").replace(/^www\./, "");
  if (body.includes("*")) return false;
  const ascii = normalizeHost(body);
  return ascii === site || ascii === normalizeHost(host).replace(/^www\./, "");
}

async function storeIdForTab(tabId: number | undefined): Promise<string> {
  if (tabId === undefined) return "0";
  const stores = await chrome.cookies.getAllCookieStores();
  return stores.find((s) => s.tabIds.includes(tabId))?.id ?? "0";
}

export async function countSiteCookies(site: string, storeId: string): Promise<number> {
  const cookies = await chrome.cookies.getAll({ storeId, partitionKey: {} });
  return cookies.filter((c) => cookieSite(c) === site).length;
}

export async function getSiteStatus(url: string | undefined, tabId?: number): Promise<SiteStatus> {
  const host = webHost(url);
  const origin = webOrigin(url);
  if (!host || !origin) return { web: false };
  const site = getRegistrableDomain(host);
  const rules = await loadRules(chrome.storage.local, newId, Date.now());
  const compiled = compileRules(rules);
  const c = classifyHost(compiled, host);
  const matching = [...c.keepRules, ...c.restartRules].map((r) => ({ id: r.id, pattern: r.pattern, list: r.list }));
  const removable = [...c.keepRules, ...c.restartRules].filter((r) => isRemovableFor(r, host, site)).map((r) => r.id);
  const cookies = await countSiteCookies(site, await storeIdForTab(tabId));
  return { web: true, host, site, siteLabel: toUnicodeHost(site), origin, list: c.list, cookies, matching, removable };
}

/** Popup "Keep" / "Keep until restart": move this site's own rule to the list, or add *.<site>. */
export async function keepSite(host: string, list: ListType): Promise<void> {
  const site = getRegistrableDomain(host);
  const rules = await loadRules(chrome.storage.local, newId, Date.now());
  const own = rules.filter((r) => isRemovableFor(r, host, site));
  if (own.length > 0) {
    await saveRules(chrome.storage.local, rules.map((r) => (own.includes(r) ? { ...r, list } : r)));
  } else {
    await saveRules(chrome.storage.local, [...rules, createRule(`*.${site}`, list, newId, Date.now())]);
  }
}

/** Popup "Remove from list": removes this site's own rules (broad wildcards and regexes stay; edit those in settings). */
export async function removeSite(host: string): Promise<void> {
  const site = getRegistrableDomain(host);
  const rules = await loadRules(chrome.storage.local, newId, Date.now());
  await saveRules(chrome.storage.local, rules.filter((r) => !isRemovableFor(r, host, site)));
}

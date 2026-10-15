/**
 * The cleanup decision (PRD "The cleanup decision"), as pure functions.
 *
 * For every cookie, in this order:
 *  1. A Keep rule matches the cookie's domain and keeps this cookie name: keep ("keepList").
 *  2. Partitioned cookie whose top-level site matches a Keep rule, and
 *     "Keep embedded cookies on kept sites" is on: keep ("keepEmbedded").
 *  3. A Keep until restart rule matches and keeps this name, and this is not a
 *     startup cleanup: keep ("restartList").
 *  4. The cookie is in use (its site, or for a partitioned cookie its top-level
 *     site, is open in this cookie store) and the cleanup does not include open
 *     tabs: keep ("open").
 *  5. Otherwise: delete ("notKept").
 *
 * No browser API calls and no module-level state: everything comes in as arguments.
 */
import { getRegistrableDomain, normalizeHost } from "./domains";
import { classifyHost, rulesKeepCookie, type CompiledRule, type Rule } from "./rules";
import type { Settings } from "./settings";

/** What started a cleanup. "site" is "Clean this site now" for one registrable domain. */
export type CleanupKind = "tabClose" | "domainChange" | "startup" | "manual" | "site";

export type CookieLike = {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  storeId: string;
  partitionKey?: { topLevelSite?: string; hasCrossSiteAncestor?: boolean };
};

export type KeepReason = "keepList" | "keepEmbedded" | "restartList" | "open";
export type Decision = { action: "keep"; reason: KeepReason } | { action: "delete"; reason: "notKept" | "siteClean" };

export type DecisionContext = {
  rules: readonly CompiledRule[];
  /** Registrable domains open in a tab, per cookie store id. */
  openSites: ReadonlyMap<string, ReadonlySet<string>>;
  kind: CleanupKind;
  /** "Clean, including open tabs", or startup with "Clean open tabs at startup": open sites are not protected. */
  includeOpen: boolean;
  settings: Pick<Settings, "keepEmbeddedOnKeptSites">;
  /** For kind "site": the registrable domain being cleaned. */
  site?: string;
};

/** Hostname of a partition key's top-level site ("https://b.test" -> "b.test"), or "" if none. */
export function topLevelHost(cookie: CookieLike): string {
  const tls = cookie.partitionKey?.topLevelSite;
  if (!tls) return "";
  try {
    return new URL(tls).hostname;
  } catch {
    return normalizeHost(tls.replace(/^[a-z]+:\/\//i, ""));
  }
}

export function isPartitioned(cookie: CookieLike): boolean {
  return topLevelHost(cookie) !== "";
}

/** The site a cookie is attributed to in counts and the log: its top-level site if partitioned, else its own site. */
export function cookieSite(cookie: CookieLike): string {
  return getRegistrableDomain(isPartitioned(cookie) ? topLevelHost(cookie) : cookie.domain);
}

export function decideCookie(cookie: CookieLike, ctx: DecisionContext): Decision {
  const host = normalizeHost(cookie.domain);
  const partitioned = isPartitioned(cookie);

  if (ctx.kind === "site") {
    // "Clean this site": everything belonging to the site, whether listed or open.
    return cookieSite(cookie) === ctx.site || getRegistrableDomain(host) === ctx.site
      ? { action: "delete", reason: "siteClean" }
      : { action: "keep", reason: "open" };
  }

  const own = classifyHost(ctx.rules, host);
  if (own.keepRules.length > 0 && rulesKeepCookie(own.keepRules, cookie.name)) return { action: "keep", reason: "keepList" };

  if (partitioned && ctx.settings.keepEmbeddedOnKeptSites) {
    const top = classifyHost(ctx.rules, topLevelHost(cookie));
    if (top.keepRules.length > 0) return { action: "keep", reason: "keepEmbedded" };
  }

  if (ctx.kind !== "startup" && own.restartRules.length > 0 && rulesKeepCookie(own.restartRules, cookie.name)) {
    return { action: "keep", reason: "restartList" };
  }

  if (!ctx.includeOpen) {
    const open = ctx.openSites.get(cookie.storeId);
    const site = getRegistrableDomain(partitioned ? topLevelHost(cookie) : host);
    if (open?.has(site)) return { action: "keep", reason: "open" };
  }

  return { action: "delete", reason: "notKept" };
}

import { SITE_DATA_TYPES, type SiteDataType } from "./site-data";
export { SITE_DATA_TYPES, type SiteDataType };

/**
 * Which site data types to clean for a top-level origin's host. Data that embedded
 * sites stored under this site follows the same decision (Chrome keys it by top-level site).
 * Returns [] when nothing is cleaned, with the reason.
 */
export function decideSiteData(
  host: string,
  ctx: DecisionContext & { enabled: Settings["siteData"]; storeIds: readonly string[] },
): { types: SiteDataType[]; reason: KeepReason | "notKept" | "siteClean" } {
  const enabled = SITE_DATA_TYPES.filter((t) => ctx.enabled[t]);
  const site = getRegistrableDomain(host);
  if (ctx.kind === "site") return ctx.site === site ? { types: enabled, reason: "siteClean" } : { types: [], reason: "open" };

  if (!ctx.includeOpen && ctx.storeIds.some((id) => ctx.openSites.get(id)?.has(site))) {
    return { types: [], reason: "open" };
  }
  const c = classifyHost(ctx.rules, host);
  const cleanFrom = (rules: Rule[]) => enabled.filter((t) => rules.every((r) => r.siteData[t] === "clean"));
  if (c.keepRules.length > 0) return { types: cleanFrom(c.keepRules), reason: "keepList" };
  if (c.restartRules.length > 0 && ctx.kind !== "startup") return { types: cleanFrom(c.restartRules), reason: "restartList" };
  return { types: enabled, reason: "notKept" };
}

/** Builds the removal URL for the cookies API remove call: scheme from the secure flag, domain without leading dot, path. */
export function cookieUrl(cookie: Pick<CookieLike, "secure" | "domain" | "path">): string {
  const host = cookie.domain.replace(/^\.+/, "");
  const path = cookie.path && cookie.path.startsWith("/") ? cookie.path : `/${cookie.path ?? ""}`;
  return `http${cookie.secure ? "s" : ""}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}${path}`;
}

/** Identity of a cookie in a store: same name, domain, path, store and partition. */
export function cookieKey(c: CookieLike): string {
  const pk = c.partitionKey;
  return [c.storeId, c.name, c.domain, c.path, pk?.topLevelSite ?? "", pk ? String(pk.hasCrossSiteAncestor ?? "") : ""].join("\u0000");
}

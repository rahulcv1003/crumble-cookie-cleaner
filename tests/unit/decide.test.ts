import { beforeEach, describe, expect, it } from "vitest";
import { cookieUrl, decideCookie, decideSiteData, type CookieLike, type DecisionContext } from "../../src/core/decide";
import { compileRules, createRule, type Rule } from "../../src/core/rules";
import { defaultSettings } from "../../src/core/settings";
import { getOpenSites } from "../../src/background/open-sites";
import { installFakeChrome } from "./fake-chrome";

let n = 0;
const rule = (pattern: string, list: Rule["list"] = "keep", extra: Partial<Rule> = {}): Rule => ({ ...createRule(pattern, list, () => `r${++n}`, 0), ...extra });
const cookie = (name: string, domain: string, extra: Partial<CookieLike> = {}): CookieLike => ({ name, domain, path: "/", secure: true, storeId: "0", ...extra });
const ctx = (over: Partial<Omit<DecisionContext, "rules">> & { rules?: Rule[]; open?: string[] } = {}): DecisionContext => ({
  rules: compileRules(over.rules ?? []),
  openSites: new Map([["0", new Set(over.open ?? [])]]),
  kind: over.kind ?? "tabClose",
  includeOpen: over.includeOpen ?? false,
  settings: over.settings ?? { keepEmbeddedOnKeptSites: true },
});

describe("Cleanup decision", () => {
  it("DEC-01 cookie for an unlisted, unopened site on tab-close cleanup is deleted with a reason", () => {
    expect(decideCookie(cookie("a", "a.test"), ctx())).toEqual({ action: "delete", reason: "notKept" });
  });

  it("DEC-02 cookie for a Keep site is kept in every cleanup type", () => {
    const rules = [rule("*.a.test")];
    for (const kind of ["tabClose", "domainChange", "startup", "manual"] as const) {
      for (const includeOpen of [false, true]) {
        expect(decideCookie(cookie("a", ".a.test"), ctx({ rules, kind, includeOpen }))).toEqual({ action: "keep", reason: "keepList" });
      }
    }
  });

  it("DEC-03 Keep until restart site is kept on tab-close cleanup", () => {
    expect(decideCookie(cookie("a", "a.test"), ctx({ rules: [rule("a.test", "restart")] }))).toEqual({ action: "keep", reason: "restartList" });
  });

  it("DEC-04 Keep until restart site is deleted on startup cleanup", () => {
    expect(decideCookie(cookie("a", "a.test"), ctx({ rules: [rule("a.test", "restart")], kind: "startup" })).action).toBe("delete");
    // but still kept at startup if it is open (unless open tabs are included)
    expect(decideCookie(cookie("a", "a.test"), ctx({ rules: [rule("a.test", "restart")], kind: "startup", open: ["a.test"] }))).toEqual({ action: "keep", reason: "open" });
  });

  it("DEC-05 open site on a normal cleanup is kept, reason open", () => {
    expect(decideCookie(cookie("a", "a.test"), ctx({ open: ["a.test"] }))).toEqual({ action: "keep", reason: "open" });
  });

  it("DEC-06 open site on an 'include open tabs' cleanup is deleted unless listed", () => {
    expect(decideCookie(cookie("a", "a.test"), ctx({ open: ["a.test"], kind: "manual", includeOpen: true })).action).toBe("delete");
    expect(decideCookie(cookie("a", "a.test"), ctx({ open: ["a.test"], kind: "manual", includeOpen: true, rules: [rule("a.test")] })).action).toBe("keep");
    expect(decideCookie(cookie("a", "a.test"), ctx({ open: ["a.test"], kind: "manual", includeOpen: true, rules: [rule("a.test", "restart")] })).action).toBe("keep");
  });

  it("DEC-07 cookie on accounts.example.com is kept while www.example.com is open", async () => {
    const fake = installFakeChrome();
    fake.setTabs([{ url: "https://www.example.com/page" }]);
    const openSites = await getOpenSites({ cleanDiscardedTabs: false });
    expect(decideCookie(cookie("sid", ".accounts.example.com"), { ...ctx(), openSites })).toEqual({ action: "keep", reason: "open" });
  });

  it("DEC-08 discarded tab: kept while 'clean discarded tabs' is off, deleted when on", async () => {
    const fake = installFakeChrome();
    fake.setTabs([{ url: "https://a.test/", discarded: true }]);
    const off = await getOpenSites({ cleanDiscardedTabs: false });
    const on = await getOpenSites({ cleanDiscardedTabs: true });
    expect(decideCookie(cookie("a", "a.test"), { ...ctx(), openSites: off }).action).toBe("keep");
    expect(decideCookie(cookie("a", "a.test"), { ...ctx(), openSites: on }).action).toBe("delete");
  });

  it("DEC-11 removal URL from a leading-dot domain, Secure flag and a path", () => {
    expect(cookieUrl({ domain: ".shop.example.com", secure: true, path: "/cart" })).toBe("https://shop.example.com/cart");
    expect(cookieUrl({ domain: "a.test", secure: false, path: "/" })).toBe("http://a.test/");
    expect(cookieUrl({ domain: "::1", secure: false, path: "/" })).toBe("http://[::1]/");
  });

  describe("partitioned cookies", () => {
    const part = (top: string) => cookie("part", "widget.test", { partitionKey: { topLevelSite: `https://${top}`, hasCrossSiteAncestor: true } });

    it("is in use only while its top-level site is open, not when the embedded site itself is open", () => {
      expect(decideCookie(part("news.test"), ctx({ open: ["news.test"] }))).toEqual({ action: "keep", reason: "open" });
      expect(decideCookie(part("news.test"), ctx({ open: ["widget.test"] })).action).toBe("delete");
      // the unpartitioned widget cookie is in use when widget.test is open
      expect(decideCookie(cookie("plain", "widget.test"), ctx({ open: ["widget.test"] })).action).toBe("keep");
    });

    it("is kept when its top-level site is on Keep and 'keep embedded cookies on kept sites' is on; deleted when off", () => {
      const rules = [rule("b.test")];
      expect(decideCookie(part("b.test"), ctx({ rules }))).toEqual({ action: "keep", reason: "keepEmbedded" });
      expect(decideCookie(part("b.test"), ctx({ rules, settings: { keepEmbeddedOnKeptSites: false } })).action).toBe("delete");
    });

    it("open sites are per cookie store: a site open in a normal window does not protect incognito cookies", async () => {
      const fake = installFakeChrome();
      fake.addStore("1");
      fake.setTabs([{ url: "https://a.test/" }]);
      const openSites = await getOpenSites({ cleanDiscardedTabs: false });
      expect(decideCookie(cookie("a", "a.test"), { ...ctx(), openSites }).action).toBe("keep");
      expect(decideCookie(cookie("a", "a.test", { storeId: "1" }), { ...ctx(), openSites }).action).toBe("delete");
    });
  });

  describe("named cookies (RUL-10 decision part)", () => {
    const rules = [rule("example.com", "keep", { cookies: { mode: "named", names: ["sid", "lang"] } })];
    it("keeps the named cookies and deletes the others once the site is closed", () => {
      expect(decideCookie(cookie("sid", "example.com"), ctx({ rules })).action).toBe("keep");
      expect(decideCookie(cookie("lang", "www.example.com"), ctx({ rules })).action).toBe("keep");
      expect(decideCookie(cookie("track", "example.com"), ctx({ rules })).action).toBe("delete");
      // while open, unnamed cookies are still in use
      expect(decideCookie(cookie("track", "example.com"), ctx({ rules, open: ["example.com"] })).action).toBe("keep");
    });
  });

  describe("site data decisions", () => {
    const sd = (over: Parameters<typeof ctx>[0] = {}) => ({ ...ctx(over), enabled: defaultSettings().siteData, storeIds: ["0"] });
    it("cleans every enabled type for an unkept closed site, nothing for an open one", () => {
      expect(decideSiteData("a.test", sd()).types).toEqual(["localStorage", "indexedDB", "cacheStorage", "serviceWorkers"]);
      expect(decideSiteData("a.test", sd({ open: ["a.test"] })).types).toEqual([]);
      expect(decideSiteData("a.test", sd({ open: ["a.test"], includeOpen: true })).types).toHaveLength(4);
    });
    it("a Keep rule keeps site data except the types it marks Clean (DAT-03 decision)", () => {
      const keepLsClean = rule("a.test", "keep", { siteData: { localStorage: "clean", indexedDB: "keep", cacheStorage: "keep", serviceWorkers: "keep" } });
      expect(decideSiteData("a.test", sd({ rules: [keepLsClean] }))).toEqual({ types: ["localStorage"], reason: "keepList" });
      expect(decideSiteData("a.test", sd({ rules: [rule("a.test")] })).types).toEqual([]);
    });
    it("Keep until restart keeps site data until a startup cleanup", () => {
      expect(decideSiteData("a.test", sd({ rules: [rule("a.test", "restart")] })).types).toEqual([]);
      expect(decideSiteData("a.test", sd({ rules: [rule("a.test", "restart")], kind: "startup" })).types).toHaveLength(4);
    });
  });
});

beforeEach(() => {
  n = 0;
});

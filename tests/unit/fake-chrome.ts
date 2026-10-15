/**
 * In-memory fake of the chrome.* APIs the service worker uses, for unit tests.
 * Mirrors the behaviour the spikes measured, including the trap that
 * chrome.cookies.remove without the right partitionKey returns a non-null
 * result but deletes nothing.
 */
import { vi } from "vitest";

type Cookie = chrome.cookies.Cookie;
type PartitionKey = { topLevelSite?: string; hasCrossSiteAncestor?: boolean };

function area() {
  let data: Record<string, unknown> = {};
  return {
    async get(keys?: string | string[] | null) {
      if (keys === null || keys === undefined) return JSON.parse(JSON.stringify(data));
      const list = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items: Record<string, unknown>) {
      data = { ...data, ...JSON.parse(JSON.stringify(items)) };
    },
    async remove(keys: string | string[]) {
      for (const k of typeof keys === "string" ? [keys] : keys) delete data[k];
    },
    async clear() {
      data = {};
    },
    dump: () => JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
  };
}

const samePk = (a?: PartitionKey, b?: PartitionKey) =>
  (!a && !b) || (!!a && !!b && a.topLevelSite === b.topLevelSite && Boolean(a.hasCrossSiteAncestor) === Boolean(b.hasCrossSiteAncestor));

export type FakeChrome = ReturnType<typeof createFakeChrome>;

export function createFakeChrome() {
  let cookies: Cookie[] = [];
  let tabs: chrome.tabs.Tab[] = [];
  let stores: { id: string; tabIds: number[] }[] = [{ id: "0", tabIds: [] }];
  const alarms = new Map<string, chrome.alarms.Alarm>();
  const undeletable = new Set<string>(); // "name|domain": remove succeeds on paper but the cookie stays
  const throwing = new Set<string>(); // "name|domain": remove rejects

  const cookieId = (c: { name: string; domain: string }) => `${c.name}|${c.domain}`;

  const api = {
    runtime: { id: "fake-extension-id", getManifest: () => ({ version: "0.1.0" }) },
    storage: { local: area(), session: area() },
    cookies: {
      getAllCookieStores: vi.fn(async () => stores.map((s) => ({ ...s, tabIds: [...s.tabIds] }))),
      getAll: vi.fn(async (details: { storeId?: string; partitionKey?: PartitionKey; domain?: string }) =>
        cookies
          .filter((c) => (details.storeId ? c.storeId === details.storeId : c.storeId === "0"))
          .filter((c) => (details.partitionKey ? true : !c.partitionKey))
          .map((c) => ({ ...c, partitionKey: c.partitionKey ? { ...c.partitionKey } : undefined }))
          .map((c) => {
            if (!c.partitionKey) delete (c as Partial<Cookie>).partitionKey;
            return c;
          }),
      ),
      remove: vi.fn(async (details: { url: string; name: string; storeId?: string; partitionKey?: PartitionKey }) => {
        const u = new URL(details.url);
        const match = cookies.find(
          (c) =>
            c.name === details.name &&
            (details.storeId ?? "0") === c.storeId &&
            c.domain.replace(/^\./, "") === u.hostname &&
            u.pathname.startsWith(c.path) &&
            samePk(c.partitionKey, details.partitionKey),
        );
        if (match && throwing.has(cookieId(match))) throw new Error("remove failed");
        if (match && !undeletable.has(cookieId(match))) cookies = cookies.filter((c) => c !== match);
        // Like Chrome: a non-null result even when nothing matched.
        return { url: details.url, name: details.name, storeId: details.storeId ?? "0", ...(details.partitionKey ? { partitionKey: details.partitionKey } : {}) };
      }),
      set: vi.fn(async (d: chrome.cookies.SetDetails) => {
        const u = new URL(d.url);
        const c: Cookie = {
          name: d.name ?? "",
          value: d.value ?? "",
          domain: d.domain ?? u.hostname,
          hostOnly: !d.domain,
          path: d.path ?? "/",
          secure: d.secure ?? false,
          httpOnly: d.httpOnly ?? false,
          sameSite: d.sameSite ?? "unspecified",
          session: d.expirationDate === undefined,
          storeId: d.storeId ?? "0",
          ...(d.expirationDate !== undefined ? { expirationDate: d.expirationDate } : {}),
          ...(d.partitionKey ? { partitionKey: { ...d.partitionKey } } : {}),
        } as Cookie;
        cookies = cookies.filter((x) => !(x.name === c.name && x.domain === c.domain && x.path === c.path && x.storeId === c.storeId && samePk(x.partitionKey, c.partitionKey)));
        cookies.push(c);
        return c;
      }),
    },
    browsingData: { remove: vi.fn(async (_options: unknown, _types: unknown) => undefined) },
    alarms: {
      create: vi.fn(async (name: string, info: { when?: number }) => {
        alarms.set(name, { name, scheduledTime: info.when ?? Date.now() } as chrome.alarms.Alarm);
      }),
      clear: vi.fn(async (name: string) => alarms.delete(name)),
      get: vi.fn(async (name: string) => alarms.get(name)),
      getAll: vi.fn(async () => [...alarms.values()]),
    },
    tabs: {
      query: vi.fn(async () => tabs.map((t) => ({ ...t }))),
      get: vi.fn(async (id: number) => {
        const t = tabs.find((x) => x.id === id);
        if (!t) throw new Error("No tab");
        return { ...t };
      }),
      reload: vi.fn(async () => undefined),
    },
  };

  const helpers = {
    api,
    /** Adds a cookie as a site would have set it. */
    addCookie(c: Partial<Cookie> & { name: string; domain: string }): Cookie {
      const full = {
        value: "v",
        hostOnly: !c.domain.startsWith("."),
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "no_restriction",
        session: true,
        storeId: "0",
        ...c,
      } as Cookie;
      cookies.push(full);
      return full;
    },
    cookies: () => cookies.map((c) => ({ ...c })),
    names: () => cookies.map((c) => `${c.name}@${c.domain}${c.partitionKey ? `^${c.partitionKey.topLevelSite}` : ""}`).sort(),
    /** Sets the open tabs (http(s) URLs) for store "0" unless storeId is given. */
    setTabs(list: { url: string; discarded?: boolean; storeId?: string; incognito?: boolean }[]) {
      tabs = list.map((t, i) => ({ id: i + 1, url: t.url, discarded: t.discarded ?? false, incognito: t.incognito ?? false }) as chrome.tabs.Tab);
      const byStore = new Map<string, number[]>();
      list.forEach((t, i) => {
        const s = t.storeId ?? "0";
        byStore.set(s, [...(byStore.get(s) ?? []), i + 1]);
      });
      const ids = new Set(["0", ...stores.map((s) => s.id), ...byStore.keys()]);
      stores = [...ids].map((id) => ({ id, tabIds: byStore.get(id) ?? [] }));
    },
    addStore(id: string) {
      if (!stores.some((s) => s.id === id)) stores.push({ id, tabIds: [] });
    },
    makeUndeletable(name: string, domain: string) {
      undeletable.add(`${name}|${domain}`);
    },
    makeThrowing(name: string, domain: string) {
      throwing.add(`${name}|${domain}`);
    },
    alarms,
  };
  return helpers;
}

/** Installs a fresh fake as the global `chrome` and returns its helpers. */
export function installFakeChrome() {
  const fake = createFakeChrome();
  (globalThis as unknown as { chrome: unknown }).chrome = fake.api;
  return fake;
}

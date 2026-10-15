/**
 * Test-only extension page (built into dist-test/ only). Exposes the real core
 * modules, bound to chrome.storage.local, so E2E tests can exercise them inside
 * the extension without any test code in the shipped build.
 */
import * as settings from "../../src/core/settings";
import * as rules from "../../src/core/rules";

const storage = chrome.storage.local;
const newId = (): string => crypto.randomUUID();

const hooks = {
  loadSettings: () => settings.loadSettings(storage),
  saveSettings: (change: Parameters<typeof settings.saveSettings>[1]) => settings.saveSettings(storage, change),
  loadRules: () => settings.loadRules(storage, newId, Date.now()),
  addRules: async (input: string, list: rules.ListType) => {
    const parsed = rules.parseRuleInput(input);
    const current = await settings.loadRules(storage, newId, Date.now());
    const added = parsed.patterns.map((p) => rules.createRule(p, list, newId, Date.now()));
    await settings.saveRules(storage, [...current, ...added]);
    return { added, errors: parsed.errors };
  },
  rawGet: (keys: string[] | null) => storage.get(keys),
  rawSet: (items: Record<string, unknown>) => storage.set(items),
  manifestVersion: () => chrome.runtime.getManifest().version,
  /** Sends a message to the service worker exactly as the extension's pages do. */
  send: (message: unknown) => chrome.runtime.sendMessage(message),
  sessionGet: (keys: string[] | null) => chrome.storage.session.get(keys),
  /** Every cookie in every store, partitioned ones included. */
  cookies: async () => {
    const stores = await chrome.cookies.getAllCookieStores();
    return (await Promise.all(stores.map((s) => chrome.cookies.getAll({ storeId: s.id, partitionKey: {} })))).flat();
  },
  setCookie: (details: chrome.cookies.SetDetails) => chrome.cookies.set(details),
  tabs: () => chrome.tabs.query({}),
  discardTabWithUrlPrefix: async (prefix: string) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url?.startsWith(prefix));
    if (!tab?.id) throw new Error(`no tab ${prefix}`);
    return chrome.tabs.discard(tab.id);
  },
  alarms: () => chrome.alarms.getAll(),
  cookieStores: () => chrome.cookies.getAllCookieStores(),
  openIncognito: async (url: string) => {
    const w = await chrome.windows.create({ incognito: true, url });
    const tab = w?.tabs?.[0];
    if (tab?.id !== undefined) {
      for (let i = 0; i < 50; i++) {
        const t = await chrome.tabs.get(tab.id);
        if (t.status === "complete" && t.url) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return { windowId: w?.id, tabId: tab?.id };
  },
  removeTab: (tabId: number) => chrome.tabs.remove(tabId),
  closeWindow: (windowId: number) => chrome.windows.remove(windowId),
  isAllowedIncognito: () => chrome.extension.isAllowedIncognitoAccess(),
  badgeText: (tabId: number) => chrome.action.getBadgeText({ tabId }),
  iconFor: async (tabId: number) => (await chrome.storage.session.get(`icon:${tabId}`))[`icon:${tabId}`],
  tabIdByUrlPrefix: async (prefix: string) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(prefix))?.id,
  activate: (tabId: number) => chrome.tabs.update(tabId, { active: true }),
  addRule: async (pattern: string, list: rules.ListType, options: Partial<rules.Rule> = {}) => {
    const current = await settings.loadRules(storage, newId, Date.now());
    const rule = { ...rules.createRule(pattern, list, newId, Date.now()), ...options };
    await settings.saveRules(storage, [...current, rule]);
    return rule;
  },
};

(globalThis as unknown as { crumbleTest: typeof hooks }).crumbleTest = hooks;

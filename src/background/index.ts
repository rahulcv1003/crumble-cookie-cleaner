/**
 * Service worker entry point. Every listener is registered synchronously at the top
 * level so Chrome can wake the worker for any of them. No state that a cleanup depends
 * on is kept in this worker's memory; see state.ts for what lives in storage.
 */
import { CONFIG, isSet } from "../config";
import type { Message } from "../core/messages";
import { initializeStorage, type InstallReason } from "../core/settings";
import { scheduleBadgeUpdate, updateActiveTabs, updateTab } from "./badge";
import { onMenuClicked, syncContextMenus } from "./menus";
import { syncOpenTabs } from "./seen-origins";
import {
  handleMessage,
  onAlarm,
  onCommand,
  onStartup,
  onTabCreated,
  onTabRemoved,
  onTabReplaced,
  onTabUpdated,
  onWake,
} from "./triggers";

const newId = (): string => crypto.randomUUID();
const report = (p: Promise<unknown>) => void p.catch((e) => console.error(e));

chrome.runtime.onInstalled.addListener((details) => {
  report(
    (async () => {
      await initializeStorage(chrome.storage.local, details.reason as InstallReason, newId, Date.now());
      await syncOpenTabs();
      await syncContextMenus();
      if (isSet(CONFIG.uninstallFormUrl)) await chrome.runtime.setUninstallURL(CONFIG.uninstallFormUrl);
      // First install opens the welcome page; updates never open a tab.
      if (details.reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
      await updateActiveTabs();
    })(),
  );
});
chrome.runtime.onStartup.addListener(() => report(onStartup().then(updateActiveTabs)));
chrome.tabs.onCreated.addListener((tab) => report(onTabCreated(tab)));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  report(onTabUpdated(tabId, changeInfo, tab));
  if (tab.active && (changeInfo.url || changeInfo.status)) report(updateTab(tab));
});
chrome.tabs.onActivated.addListener(({ tabId }) => report(chrome.tabs.get(tabId).then(updateTab)));
chrome.windows.onFocusChanged.addListener(() => report(updateActiveTabs()));
chrome.cookies.onChanged.addListener(() => scheduleBadgeUpdate(500));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.rules || changes.settings) scheduleBadgeUpdate(50, true);
  if (changes.settings) {
    const before = (changes.settings.oldValue as { display?: { contextMenus?: boolean } } | undefined)?.display?.contextMenus;
    const after = (changes.settings.newValue as { display?: { contextMenus?: boolean } } | undefined)?.display?.contextMenus;
    if (before !== after) report(syncContextMenus());
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => report(onMenuClicked(info, tab)));
chrome.tabs.onRemoved.addListener((tabId) => report(onTabRemoved(tabId)));
chrome.tabs.onReplaced.addListener((added, removed) => report(onTabReplaced(added, removed)));
chrome.alarms.onAlarm.addListener((alarm) => report(onAlarm(alarm)));
chrome.commands.onCommand.addListener((command) => report(onCommand(command)));
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(message).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

report(onWake());

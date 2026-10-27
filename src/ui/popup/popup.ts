/**
 * Toolbar popup (PRD "Popup", docs/DESIGN.md). Everything shown comes from the service
 * worker's popupState, which uses the same rule matching as the cleanup decision, so the
 * status always says what the next cleanup will do to this site.
 */
import { formatNumber, plural, relativeTime, t } from "../../core/i18n";
import type { PopupState } from "../../core/messages";
import { clear, h, mark, send, type MarkKind } from "../dom";
import { helpButton, hideTooltip, withTooltip } from "../tooltip";

const app = document.getElementById("app")!;
let tab: chrome.tabs.Tab | undefined;
let confirming: { sites: number } | null = null;
let notice: string | null = null;

async function load(): Promise<PopupState> {
  const res = await send<{ ok: boolean; state: PopupState }>({ type: "popupState", url: tab?.url, tabId: tab?.id });
  return res.state;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each message has its own response shape
async function act(message: unknown, after?: (res: any) => void): Promise<void> {
  const res = await send(message);
  after?.(res);
  await render();
}

function siteBlock(s: PopupState): HTMLElement {
  const st = s.status;
  if (!st.web) {
    return h("section", { class: "site", "data-status": "none" },
      h("div", { class: "head" }, mark("none"), h("div", { class: "label" }, t("statusNotWebsiteTitle"))),
      h("p", { class: "status muted" }, t("statusNotWebsite")),
    );
  }
  const kind: MarkKind = st.list === "keep" ? "keep" : st.list === "restart" ? "restart" : "clean";
  const statusText = st.list === "keep" ? t("statusKept") : st.list === "restart" ? t("statusKeptUntilRestart") : t("statusWillBeCleaned");
  const editRule = st.matching.find((m) => st.removable.includes(m.id)) ?? st.matching[0];
  const actions = h("div", { class: "actions" });
  if (st.list !== "keep") actions.append(withTooltip(h("button", { class: "btn", onclick: () => act({ type: "keepSite", host: st.host, list: "keep" }) }, t("actionKeep")), t("tipKeep")));
  if (st.list !== "restart") actions.append(withTooltip(h("button", { class: "btn", onclick: () => act({ type: "keepSite", host: st.host, list: "restart" }) }, t("actionKeepUntilRestart")), t("tipRestart")));
  if (st.removable.length > 0) actions.append(withTooltip(h("button", { class: "btn", onclick: () => act({ type: "removeSite", host: st.host }) }, t("actionRemoveFromList")), t("tipRemove")));
  actions.append(withTooltip(h("button", { class: "btn site-clean", onclick: () => act({ type: "cleanSite", site: st.site, origin: st.origin }, (r) => (notice = cleanedNotice(r.entry))) }, t("actionCleanSiteNow")), t("tipCleanSite")));
  if (editRule) {
    actions.append(h("button", { class: "link", onclick: () => openSettings(`rule=${encodeURIComponent(editRule.id)}`) }, t("actionEditRule")));
  }
  return h("section", { class: "site", "data-status": kind },
    h("div", { class: "head" }, mark(kind), h("div", { class: "label" }, st.siteLabel)),
    h("p", { class: `status ${kind}` }, h("strong", {}, statusText), " ", plural("cookieCountSentence", st.cookies)),
    actions,
  );
}

function cleanedNotice(entry: { sitesCleaned: unknown[]; cookiesDeleted: number } | null): string {
  if (!entry || entry.sitesCleaned.length === 0) return t("noticeNothingCleaned");
  return t("lastCleanupJustNow", [plural("countSites", entry.sitesCleaned.length), plural("countCookies", entry.cookiesDeleted)]);
}

function controls(s: PopupState): HTMLElement {
  const sec = h("section", { class: "controls" });
  if (!s.setupComplete) {
    sec.append(h("p", { class: "note" }, t("setupUnfinished"), " ", h("button", { class: "link", onclick: () => openPage("welcome.html") }, t("actionFinishSetup"))));
  } else {
    const sw = h("input", { type: "checkbox", class: "switch", id: "auto", role: "switch", checked: s.autoClean, "aria-checked": String(s.autoClean), onchange: (e: Event) => act({ type: "setAutoClean", on: (e.target as HTMLInputElement).checked }) });
    sec.append(h("div", { class: "row" }, h("div", { class: "help-label" }, h("label", { for: "auto" }, t("autoCleanLabel")), helpButton(t("autoCleanLabel"), t("tipAutomatic"))), withTooltip(sw, t("tipAutomatic"))));
  }
  const buttons = h("div", { class: "buttons" },
    h("button", { class: "btn primary", onclick: () => act({ type: "cleanNow" }, (r) => (notice = cleanedNotice(r.entry))) }, t("actionCleanNow")),
    h("button", { class: "btn", onclick: async () => {
      const p = await send<{ sites: number }>({ type: "previewClean", includeOpen: true });
      confirming = { sites: p.sites };
      await render();
    } }, t("actionCleanIncludingOpen")),
  );
  withTooltip(buttons.children[0] as HTMLElement, t("tipCleanNow"));
  withTooltip(buttons.children[1] as HTMLElement, t("tipCleanOpen"));
  sec.append(buttons);
  if (confirming) {
    const n = confirming.sites;
    sec.append(h("div", { class: "confirm", role: "alertdialog", "aria-labelledby": "confirm-text" },
      h("p", { id: "confirm-text" }, n === 0 ? t("confirmNothingToClean") : plural("confirmCleanIncludingOpen", n)),
      h("div", { class: "buttons" },
        n > 0 ? h("button", { class: "btn danger primary", onclick: () => { confirming = null; void act({ type: "cleanIncludingOpen" }, (r) => (notice = cleanedNotice(r.entry))); } }, t("actionConfirmCleanIncludingOpen")) : null,
        h("button", { class: "btn", onclick: () => { confirming = null; void render(); } }, t("actionCancel")),
      ),
    ));
  }
  return sec;
}

function lastCleanup(s: PopupState): HTMLElement | null {
  if (s.progress) {
    return h("section", { class: "last" },
      h("p", {}, t("progressCleaning", [formatNumber(s.progress.done), formatNumber(s.progress.total)])),
      h("progress", { max: String(s.progress.total), value: String(s.progress.done), "aria-hidden": "true" }),
    );
  }
  if (!s.last && !notice) return null;
  const links = h("div", { class: "links" });
  if (s.undo.available) {
    links.append(withTooltip(h("button", { class: "link", onclick: () => act({ type: "undo" }, (r) => (notice = r.expired ? t("undoExpired") : plural("undoRestored", r.restored))) }, t("actionUndoCleanup")), t("tipUndo")));
  }
  if (s.last) links.append(h("button", { class: "link", onclick: () => openSettings("section=log") }, t("actionDetails")));
  const line = notice ?? (s.last!.sitesCleaned.length === 0
    ? t("lastCleanupNothing", [relativeTime(s.last!.time)])
    : t("lastCleanup", [plural("countSites", s.last!.sitesCleaned.length), plural("countCookies", s.last!.cookiesDeleted), relativeTime(s.last!.time)]));
  return h("section", { class: "last" },
    h("p", {}, line),
    s.undo.available ? h("p", { class: "muted" }, t("undoHint")) : null,
    links,
  );
}

function rating(s: PopupState): HTMLElement | null {
  if (!s.showRating) return null;
  return h("section", { class: "rating" },
    h("p", { class: "note" }, t("ratingAsk")),
    h("div", { class: "buttons" },
      h("button", { class: "btn", onclick: () => act({ type: "rating", action: "open" }) }, t("actionRate")),
      h("button", { class: "link", onclick: () => act({ type: "rating", action: "dismiss" }) }, t("actionNotNow")),
    ),
  );
}

function openSettings(hash: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html#${hash}`) });
  window.close();
}
function openPage(page: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  window.close();
}

async function render(): Promise<void> {
  const s = await load();
  const focusedId = (document.activeElement as HTMLElement | null)?.id;
  clear(app);
  hideTooltip();
  app.append(
    h("header", {}, h("div", { class: "brand" }, h("span", { class: "brand-badge" }, mark("clean")), h("h1", { class: "name" }, t("productName"))), h("button", { class: "link", onclick: () => openSettings("") }, t("popupSettings"))),
    siteBlock(s),
    controls(s),
  );
  const last = lastCleanup(s);
  if (last) app.append(last);
  const r = rating(s);
  if (r) app.append(r);
  if (focusedId) document.getElementById(focusedId)?.focus();
}

async function main(): Promise<void> {
  // popup.html?tabId=N shows the popup for a given tab (used when the popup is opened as a page, e.g. by tests).
  const forced = Number(new URLSearchParams(location.search).get("tabId"));
  if (forced) tab = await chrome.tabs.get(forced).catch(() => undefined);
  else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await render();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes.cleanupProgress) void render();
    if (area === "local" && (changes.rules || changes.settings || changes.cleanupLog)) void render();
  });
}

void main();

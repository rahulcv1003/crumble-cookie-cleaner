/**
 * Settings page (PRD "Settings page"): Lists, Cleaning, Site data, Log, Display, About.
 * Settings and rules are written straight to chrome.storage.local through core/settings;
 * the service worker reacts to the change, so every setting takes effect without a restart.
 */
import { CONFIG, isSet } from "../../config";
import { SITE_DATA_TYPES, type SiteDataType } from "../../core/site-data";
import { plural, t } from "../../core/i18n";
import { applyImport, exportRules, planCounts, planImport, type ImportPlan } from "../../core/import-export";
import type { LogEntry } from "../../core/log";
import { createRule, parseRuleInput, type ListType, type Rule } from "../../core/rules";
import { DELAY_MAX_SECONDS, DELAY_MIN_SECONDS, loadRules, loadSettings, saveRules, saveSettings, type Settings } from "../../core/settings";
import { confirmDialog } from "../dialog";
import { append, clear, h, mark, send } from "../dom";
import { navIcon } from "../icons";
import { helpButton, hideTooltip, withTooltip } from "../tooltip";
import { cookiesSummary, listLabel, ruleErrorText, siteDataSummary, skipReasonText, typeLabel } from "../rule-text";

const storage = chrome.storage.local;
const newId = () => crypto.randomUUID();
const main = document.getElementById("main")!;
const nav = document.getElementById("nav")!;
const live = document.getElementById("live")!;

type View = { search: string; filter: "all" | ListType; editing: string | null; selected: Set<string>; addErrors: string[]; addText: string; addList: ListType };
const view: View = { search: "", filter: "all", editing: null, selected: new Set(), addErrors: [], addText: "", addList: "keep" };

const SECTIONS = [
  { id: "lists", title: "sectionLists" },
  { id: "cleaning", title: "sectionCleaning" },
  { id: "site-data", title: "sectionSiteData" },
  { id: "log", title: "sectionLog" },
  { id: "display", title: "sectionDisplay" },
  { id: "about", title: "sectionAbout" },
] as const;

function announce(text: string): void {
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
}

// ---------------------------------------------------------------------------
// Generic setting rows
// ---------------------------------------------------------------------------

function settingRow(id: string, label: string, explain: string, control: HTMLElement, opts: { dependent?: boolean } = {}): HTMLElement {
  const tips: Record<string, string> = {
    "set-autoClean": "tipAutomatic", "set-delay": "tipDelay", "set-cleanOnDomainChange": "tipDomainChange",
    "set-cleanDiscardedTabs": "tipDiscarded", "set-cleanOnStartup": "tipStartup", "set-cleanOpenTabsOnStartup": "tipOpenStartup",
    "set-reloadAfterStartupClean": "tipReload", "set-keepEmbeddedOnKeptSites": "tipEmbedded",
  };
  const detail = tips[id] ? t(tips[id]!) : id.startsWith("sd-") ? `${explain} ${t(id === "sd-httpCache" ? "tipHttpCache" : "tipSiteData")}` : explain;
  const input = control.matches("input, select, button") ? control : control.querySelector<HTMLElement>("input, select, button");
  if (input && detail !== explain) withTooltip(input, detail);
  const help = helpButton(label, detail);
  help.id = `${id}-help-button`;
  return h("div", { class: `setting${opts.dependent ? " dependent" : ""}` },
    h("div", { class: "text" }, h("div", { class: "help-label" }, h("label", { for: id }, label), help), h("p", { id: `${id}-help` }, explain)),
    h("div", { class: "control" }, control),
  );
}

function switchInput(id: string, checked: boolean, onChange: (on: boolean) => void | Promise<void>): HTMLInputElement {
  const input = h("input", { type: "checkbox", class: "switch", role: "switch", id, checked, "aria-checked": String(checked), "aria-describedby": `${id}-help` });
  input.addEventListener("change", async () => {
    input.setAttribute("aria-checked", String(input.checked));
    await onChange(input.checked);
  });
  return input;
}

type BoolKey = "autoClean" | "cleanOnDomainChange" | "cleanDiscardedTabs" | "cleanOnStartup" | "cleanOpenTabsOnStartup" | "reloadAfterStartupClean" | "keepEmbeddedOnKeptSites";

function boolSetting(s: Settings, key: BoolKey, opts: { dependent?: boolean } = {}): HTMLElement {
  return settingRow(`set-${key}`, t(`setting_${key}`), t(`setting_${key}_help`), switchInput(`set-${key}`, s[key], async (on) => {
    await saveSettings(storage, { [key]: on });
    await render();
  }), opts);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

async function addRules(): Promise<void> {
  const parsed = parseRuleInput(view.addText);
  view.addErrors = parsed.errors.map(ruleErrorText);
  if (parsed.patterns.length > 0) {
    const rules = await loadRules(storage, newId, Date.now());
    const existing = new Map(rules.map((r) => [r.pattern, r]));
    const next = [...rules];
    for (const pattern of parsed.patterns) {
      const old = existing.get(pattern);
      if (old) next[next.indexOf(old)] = { ...old, list: view.addList };
      else next.push(createRule(pattern, view.addList, newId, Date.now()));
    }
    await saveRules(storage, next);
    announce(plural("announceRulesAdded", parsed.patterns.length));
    view.addText = parsed.errors.length > 0 ? parsed.errors.map((e) => e.substitutions[0] ?? "").filter(Boolean).join(", ") : "";
  }
  await render();
  document.getElementById("add-pattern")?.focus();
}

function ruleEditor(rule: Rule): HTMLElement {
  const draft: Rule = structuredClone(rule);
  const radio = (name: string, value: string, checked: boolean, label: string, onChange: () => void) =>
    h("label", {}, withTooltip(h("input", { type: "radio", name, value, checked, onchange: onChange }), t(name === "list" ? "tipRuleList" : "tipCookieNames")), " ", label);
  const names = h("input", { type: "text", class: "names", "aria-label": t("cookieNamesLabel"), value: draft.cookies.mode === "named" ? draft.cookies.names.join(", ") : "", placeholder: t("cookieNamesPlaceholder"), disabled: draft.cookies.mode === "all" });
  const note = h("input", { type: "text", value: draft.note ?? "", "aria-label": t("noteLabel"), style: "width:100%" });
  const types = h("div", { class: "types" });
  withTooltip(names, t("tipCookieNames"));
  for (const type of SITE_DATA_TYPES) {
    const sel = h("select", { "aria-label": t("ruleSiteDataLabel", [typeLabel(type)]), onchange: (e: Event) => (draft.siteData[type] = (e.target as HTMLSelectElement).value as "keep" | "clean") },
      h("option", { value: "keep", selected: draft.siteData[type] === "keep" }, t("siteDataKeep")),
      h("option", { value: "clean", selected: draft.siteData[type] === "clean" }, t("siteDataClean")),
    );
    append(types, [h("span", {}, typeLabel(type)), withTooltip(sel, t("tipRuleData"))]);
  }
  const save = async () => {
    if (draft.cookies.mode === "named") {
      const list = names.value.split(",").map((x) => x.trim()).filter(Boolean);
      draft.cookies = list.length > 0 ? { mode: "named", names: [...new Set(list)] } : { mode: "all" };
    }
    const text = note.value.trim();
    if (text) draft.note = text;
    else delete draft.note;
    const rules = await loadRules(storage, newId, Date.now());
    await saveRules(storage, rules.map((r) => (r.id === rule.id ? draft : r)));
    view.editing = null;
    announce(t("announceRuleSaved"));
    await render();
  };
  return h("div", { class: "editor" },
    h("span", { class: "field-label" }, t("editorList")),
    h("fieldset", {}, h("legend", {}, t("editorList")),
      radio("list", "keep", draft.list === "keep", t("listKeep"), () => (draft.list = "keep")),
      radio("list", "restart", draft.list === "restart", t("listRestart"), () => (draft.list = "restart")),
    ),
    h("span", { class: "field-label" }, t("editorCookies")),
    h("div", {},
      h("fieldset", {}, h("legend", {}, t("editorCookies")),
        radio("cookies", "all", draft.cookies.mode === "all", t("cookiesKeepAll"), () => { draft.cookies = { mode: "all" }; names.disabled = true; }),
        radio("cookies", "named", draft.cookies.mode === "named", t("cookiesKeepOnly"), () => { draft.cookies = { mode: "named", names: [] }; names.disabled = false; names.focus(); }),
      ),
      names,
    ),
    h("span", { class: "field-label" }, t("editorSiteData")),
    types,
    h("span", { class: "field-label" }, t("noteLabel")),
    note,
    h("div", { class: "buttons" },
      h("button", { class: "btn primary", onclick: save }, t("actionSaveRule")),
      h("button", { class: "btn", onclick: async () => { view.editing = null; await render(); } }, t("actionCancel")),
    ),
  );
}

async function deleteRules(ids: string[], rules: Rule[]): Promise<void> {
  const doomed = rules.filter((r) => ids.includes(r.id));
  const ok = await confirmDialog({
    title: doomed.length === 1 ? t("confirmDeleteRuleTitle", [doomed[0]!.pattern]) : plural("confirmDeleteRulesTitle", doomed.length),
    body: [t("confirmDeleteRulesBody")],
    confirm: doomed.length === 1 ? t("actionDeleteRule") : plural("actionDeleteRules", doomed.length),
    cancel: t("actionCancel"),
    danger: true,
  });
  if (!ok) return;
  await saveRules(storage, rules.filter((r) => !ids.includes(r.id)));
  for (const id of ids) view.selected.delete(id);
  announce(plural("announceRulesDeleted", doomed.length));
  await render();
}

async function importFile(file: File): Promise<void> {
  const text = await file.text();
  const rules = await loadRules(storage, newId, Date.now());
  const result = planImport(text, rules, newId, Date.now());
  if (!result.ok) {
    await confirmDialog({ title: t("importFailedTitle"), body: [t(result.error)], confirm: t("actionChooseAnotherFile"), cancel: t("actionClose") }).then((again) => {
      if (again) document.getElementById("import-file")?.click();
    });
    return;
  }
  const plan: ImportPlan = result.plan;
  let merge = false;
  const containerCount = Object.values(plan.containers).flat().length;
  const countsLine = h("p", {});
  const updateCounts = () => {
    const c = planCounts(plan, merge);
    countsLine.textContent = t("importSummary", [plural("countRulesToAdd", c.add), plural("countRulesToReplace", c.replace), plural("countRulesSkipped", c.skipped)]);
  };
  updateCounts();
  const body: (Node | string)[] = [countsLine];
  if (containerCount > 0) {
    body.push(h("fieldset", { class: "containers" }, h("legend", {}, plural("importContainers", containerCount)),
      h("label", {}, h("input", { type: "radio", name: "containers", value: "skip", checked: true, onchange: () => { merge = false; updateCounts(); } }), " ", t("importContainersSkip")),
      h("br", {}),
      h("label", {}, h("input", { type: "radio", name: "containers", value: "merge", onchange: () => { merge = true; updateCounts(); } }), " ", t("importContainersMerge")),
    ));
  }
  const replacing = [...plan.main, ...Object.values(plan.containers).flat()].filter((p) => p.replaces);
  if (replacing.length > 0) {
    body.push(h("p", {}, t("importWillReplace")), h("ul", { class: "skipped" }, ...replacing.map((p) => h("li", { class: "code" }, p.rule.pattern))));
  }
  if (plan.skipped.length > 0) {
    body.push(h("p", {}, t("importCannotImport")), h("ul", { class: "skipped" }, ...plan.skipped.map((s) => h("li", {}, skipReasonText(s.reason, s.expression)))));
  }
  const ok = await confirmDialog({ title: t("importPreviewTitle"), body, confirm: t("actionImportRules"), cancel: t("actionCancel") });
  if (!ok) return;
  const fresh = await loadRules(storage, newId, Date.now());
  await saveRules(storage, applyImport(fresh, plan, merge));
  announce(t("announceImported"));
  await render();
}

function exportFile(rules: Rule[]): void {
  const blob = new Blob([exportRules(rules)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: `crumble-rules-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function listsSection(rules: Rule[]): HTMLElement {
  const q = view.search.trim().toLowerCase();
  const shown = rules
    .filter((r) => view.filter === "all" || r.list === view.filter)
    .filter((r) => !q || r.pattern.toLowerCase().includes(q) || (r.note ?? "").toLowerCase().includes(q))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  const search = h("input", { type: "search", id: "rule-search", value: view.search, placeholder: t("searchRulesPlaceholder"), "aria-label": t("searchRulesLabel") });
  search.addEventListener("input", () => {
    view.search = search.value;
    void renderListsOnly(rules);
  });
  const filter = h("div", { class: "segmented", role: "radiogroup", "aria-label": t("filterLabel") },
    ...(["all", "keep", "restart"] as const).map((f) =>
      h("label", {}, h("input", { type: "radio", name: "filter", value: f, checked: view.filter === f, onchange: () => { view.filter = f; void renderListsOnly(rules); } }), f === "all" ? t("filterAll") : listLabel(f)),
    ),
  );

  const addInput = h("input", { type: "text", id: "add-pattern", value: view.addText, placeholder: t("addRulePlaceholder"), "aria-label": t("addRuleLabel"), "aria-describedby": "add-help add-errors" });
  addInput.addEventListener("input", () => (view.addText = addInput.value));
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void addRules();
  });
  const addList = h("select", { "aria-label": t("addRuleListLabel"), onchange: (e: Event) => (view.addList = (e.target as HTMLSelectElement).value as ListType) },
    h("option", { value: "keep", selected: view.addList === "keep" }, t("listKeep")),
    h("option", { value: "restart", selected: view.addList === "restart" }, t("listRestart")),
  );
  withTooltip(addList, t("tipRuleList"));

  const table = h("table", { class: "rules" },
    h("thead", {}, h("tr", {},
      h("th", { class: "pick" }, h("span", { class: "visually-hidden" }, t("columnSelect"))),
      h("th", {}, h("span", { class: "visually-hidden" }, t("columnStatus"))),
      h("th", {}, t("columnPattern")),
      h("th", {}, t("columnList")),
      h("th", {}, t("columnCookies")),
      h("th", {}, t("columnSiteData")),
      h("th", {}, t("columnNote")),
      h("th", {}, h("span", { class: "visually-hidden" }, t("columnActions"))),
    )),
  );
  const tbody = h("tbody", {});
  for (const rule of shown) {
    const pick = h("input", { type: "checkbox", checked: view.selected.has(rule.id), "aria-label": t("selectRule", [rule.pattern]), onchange: (e: Event) => {
      if ((e.target as HTMLInputElement).checked) view.selected.add(rule.id);
      else view.selected.delete(rule.id);
      void renderListsOnly(rules);
    } });
    tbody.append(h("tr", { id: `rule-${rule.id}`, class: view.editing === rule.id ? "editing" : "" },
      h("td", { class: "pick" }, pick),
      h("td", { class: "markcell" }, mark(rule.list === "keep" ? "keep" : "restart")),
      h("td", { class: "pattern" }, rule.pattern),
      h("td", { class: `list-${rule.list}` }, listLabel(rule.list)),
      h("td", {}, cookiesSummary(rule)),
      h("td", {}, siteDataSummary(rule)),
      h("td", { class: "muted" }, rule.note ?? ""),
      h("td", { class: "row-actions" },
        withTooltip(h("button", { class: "link", "aria-label": t("editRuleLabel", [rule.pattern]), onclick: async () => { view.editing = view.editing === rule.id ? null : rule.id; await render(); } }, t("actionEdit")), t("tipEditRule")),
        withTooltip(h("button", { class: "link", "aria-label": t("deleteRuleLabel", [rule.pattern]), onclick: () => deleteRules([rule.id], rules) }, t("actionDelete")), t("tipDeleteRules")),
      ),
    ));
    if (view.editing === rule.id) tbody.append(h("tr", { class: "editing" }, h("td", { colspan: "8" }, ruleEditor(rule))));
  }
  table.append(tbody);

  const fileInput = h("input", { type: "file", id: "import-file", accept: ".json,application/json", class: "visually-hidden", "aria-label": t("actionImportRules"), onchange: async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (f) await importFile(f);
  } });

  const selected = [...view.selected].filter((id) => rules.some((r) => r.id === id));
  return h("section", { id: "lists", "aria-labelledby": "h-lists" },
    h("h2", { id: "h-lists" }, t("sectionLists")),
    h("p", { class: "section-note" }, t("listsNote")),
    h("div", { class: "add" }, addInput, addList, helpButton(t("addRuleListLabel"), t("tipRuleList")), h("button", { class: "btn primary", onclick: addRules }, t("actionAddRules"))),
    h("p", { id: "add-help", class: "muted", style: "margin:0 0 6px;font-size:13px" }, t("addRuleHelp")),
    view.addErrors.length ? h("ul", { class: "errors", id: "add-errors", role: "alert" }, ...view.addErrors.map((e) => h("li", {}, e))) : h("div", { id: "add-errors" }),
    h("div", { class: "toolbar" }, search, filter, h("span", { class: "muted num" }, plural("countRules", shown.length))),
    shown.length ? h("div", { class: "rules-scroll" }, table) : h("p", { class: "empty" }, rules.length ? t("noRulesMatch") : t("noRulesYet")),
    h("div", { class: "under-table" },
      withTooltip(h("button", { class: "btn danger", disabled: selected.length === 0, onclick: () => deleteRules(selected, rules) }, plural("actionDeleteSelected", selected.length)), t("tipDeleteRules")),
      withTooltip(h("button", { class: "link", onclick: () => fileInput.click() }, t("actionImportRules")), t("tipImport")),
      withTooltip(h("button", { class: "link", onclick: () => exportFile(rules), disabled: rules.length === 0 }, t("actionExportRules")), t("tipExport")),
      fileInput,
    ),
  );
}

async function renderListsOnly(rules: Rule[]): Promise<void> {
  const old = document.getElementById("lists");
  const focusId = (document.activeElement as HTMLElement | null)?.id;
  const sel = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
  const fresh = listsSection(rules);
  old?.replaceWith(fresh);
  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    el?.focus();
    if (el && sel !== null && "setSelectionRange" in el) el.setSelectionRange(sel, sel);
  }
}

// ---------------------------------------------------------------------------
// Cleaning, site data, display
// ---------------------------------------------------------------------------

function cleaningSection(s: Settings, incognitoAllowed: boolean): HTMLElement {
  const delay = h("input", { type: "number", id: "set-delay", min: String(DELAY_MIN_SECONDS), max: String(DELAY_MAX_SECONDS), step: "1", value: String(s.delaySeconds), "aria-describedby": "set-delay-help" });
  delay.addEventListener("change", async () => {
    const v = Number(delay.value);
    if (Number.isInteger(v) && v >= DELAY_MIN_SECONDS && v <= DELAY_MAX_SECONDS) {
      await saveSettings(storage, { delaySeconds: v });
      announce(t("announceSaved"));
    } else {
      delay.value = String(s.delaySeconds);
      announce(t("delayOutOfRange"));
    }
  });
  return h("section", { id: "cleaning", "aria-labelledby": "h-cleaning" },
    h("h2", { id: "h-cleaning" }, t("sectionCleaning")),
    h("p", { class: "section-note" }, t("cleaningNote")),
    boolSetting(s, "autoClean"),
    settingRow("set-delay", t("setting_delay"), t("setting_delay_help"), h("span", { class: "control" }, delay, h("span", { class: "muted" }, t("unitSeconds")))),
    boolSetting(s, "cleanOnDomainChange"),
    boolSetting(s, "cleanDiscardedTabs"),
    boolSetting(s, "cleanOnStartup"),
    boolSetting(s, "cleanOpenTabsOnStartup"),
    s.cleanOpenTabsOnStartup ? boolSetting(s, "reloadAfterStartupClean", { dependent: true }) : null,
    boolSetting(s, "keepEmbeddedOnKeptSites"),
    h("div", { class: "setting" },
      h("div", { class: "text" }, h("span", { class: "label" }, t("incognitoLabel")), h("p", {}, incognitoAllowed ? t("incognitoAllowed") : t("incognitoNotAllowed"))),
      h("div", { class: "control" }),
    ),
  );
}

async function onSiteDataToggle(type: SiteDataType, on: boolean): Promise<void> {
  const s = await loadSettings(storage);
  await saveSettings(storage, { siteData: { ...s.siteData, [type]: on } });
  if (!on) return;
  const offered = ((await storage.get("siteDataOffered")).siteDataOffered ?? {}) as Record<string, boolean>;
  if (offered[type]) return;
  await storage.set({ siteDataOffered: { ...offered, [type]: true } });
  const { count } = await send<{ count: number }>({ type: "siteDataOffer", dataType: type });
  if (count === 0) return;
  const ok = await confirmDialog({
    title: plural("offerClearTitle", count, [typeLabel(type)]),
    body: [t("offerClearBody")],
    confirm: t("actionClearType", [typeLabel(type)]),
    cancel: t("actionNotNow"),
    danger: true,
  });
  if (ok) {
    const res = await send<{ count: number }>({ type: "clearSiteDataType", dataType: type });
    announce(plural("announceClearedType", res.count, [typeLabel(type)]));
  }
}

function siteDataSection(s: Settings): HTMLElement {
  return h("section", { id: "site-data", "aria-labelledby": "h-site-data" },
    h("h2", { id: "h-site-data" }, t("sectionSiteData")),
    h("p", { class: "section-note" }, t("siteDataEmbeddedNote")),
    ...SITE_DATA_TYPES.map((type) =>
      settingRow(`sd-${type}`, typeLabel(type), t(`siteData_${type}_help`), switchInput(`sd-${type}`, s.siteData[type], (on) => onSiteDataToggle(type, on))),
    ),
    settingRow("sd-httpCache", typeLabel("httpCache"), t("siteData_httpCache_help"), switchInput("sd-httpCache", s.siteData.httpCache, async (on) => {
      await saveSettings(storage, { siteData: { ...s.siteData, httpCache: on } });
    })),
  );
}

function displaySection(s: Settings): HTMLElement {
  const row = (key: keyof Settings["display"]) =>
    settingRow(`disp-${key}`, t(`display_${key}`), t(`display_${key}_help`), switchInput(`disp-${key}`, s.display[key], async (on) => {
      const cur = await loadSettings(storage);
      await saveSettings(storage, { display: { ...cur.display, [key]: on } });
    }));
  return h("section", { id: "display", "aria-labelledby": "h-display" },
    h("h2", { id: "h-display" }, t("sectionDisplay")),
    row("badge"), row("iconByList"), row("notifyAuto"), row("notifyManual"), row("contextMenus"),
    h("div", { class: "setting" },
      h("div", { class: "text" }, h("span", { class: "label" }, t("shortcutLabel")), h("p", {}, t("shortcutHelp"))),
      h("div", { class: "control" }, h("button", { class: "link", onclick: () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }) }, t("actionSetShortcut"))),
    ),
  );
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

const triggerLabel = (e: LogEntry) => t(e.includeOpen ? `trigger_${e.trigger}_open` : `trigger_${e.trigger}`);
const reasonLabel = (r: string) => t(`reason_${r}`);

function logSection(log: LogEntry[]): HTMLElement {
  const dateFmt = new Intl.DateTimeFormat(chrome.i18n.getUILanguage(), { dateStyle: "medium", timeStyle: "short" });
  const entries = log.map((e) =>
    h("details", { class: "log-entry" },
      h("summary", {},
        h("span", { class: "num" }, dateFmt.format(e.time)),
        h("span", {}, triggerLabel(e)),
        h("span", {}, e.sitesCleaned.length === 0 ? t("logNothingCleaned") : t("logSummary", [plural("countSites", e.sitesCleaned.length), plural("countCookies", e.cookiesDeleted)]), e.failures.length ? h("span", { class: "failure" }, " ", plural("logFailures", e.failures.length)) : null),
      ),
      h("div", { class: "detail" },
        h("span", { class: "muted" }, t("logCleaned")),
        e.sitesCleaned.length ? h("ul", {}, ...e.sitesCleaned.map((s) => h("li", {}, h("span", { class: "code" }, s.site), " ", plural("logSiteCookies", s.cookies), s.siteData.length ? t("logSiteData", [s.siteData.map(typeLabel).join(", ")]) : ""))) : h("span", {}, t("logNone")),
        h("span", { class: "muted" }, t("logKept")),
        e.sitesKept.length ? h("ul", {}, ...e.sitesKept.map((s) => h("li", {}, h("span", { class: "code" }, s.site), " ", reasonLabel(s.reason)))) : h("span", {}, t("logNone")),
        e.failures.length ? h("span", { class: "muted" }, t("logFailed")) : null,
        e.failures.length ? h("ul", {}, ...e.failures.map((f) => h("li", { class: "failure" }, f.kind === "cookie" ? t("logFailedCookie", [f.cookieName, f.site]) : t("logFailedSiteData", [f.site])))) : null,
      ),
    ),
  );
  return h("section", { id: "log", "aria-labelledby": "h-log" },
    h("h2", { id: "h-log" }, t("sectionLog")),
    h("p", { class: "section-note" }, t("logNote")),
    ...(entries.length ? entries : [h("p", { class: "empty" }, t("logEmpty"))]),
    h("div", { class: "under-table" },
      withTooltip(h("button", { class: "btn", disabled: log.length === 0, onclick: async () => {
        const ok = await confirmDialog({ title: t("confirmClearLogTitle"), body: [t("confirmClearLogBody")], confirm: t("actionClearLog"), cancel: t("actionCancel"), danger: true });
        if (ok) {
          await storage.set({ cleanupLog: [] });
          await render();
        }
      } }, t("actionClearLog")), t("tipClearLog")),
    ),
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

async function reportText(s: Settings, log: LogEntry[]): Promise<string> {
  const ua = navigator.userAgent;
  const lines = [
    `${t("reportVersion")}: ${chrome.runtime.getManifest().version}`,
    `${t("reportBrowser")}: ${ua}`,
    `${t("reportSettings")}: ${JSON.stringify(s)}`,
    `${t("reportLastCleanups")}:`,
    // Counts only: no sites, rules or cookie data leave the browser in a report.
    ...log.slice(0, 3).map((e) => `- ${JSON.stringify({ trigger: e.trigger, includeOpen: e.includeOpen, sitesCleaned: e.sitesCleaned.length, cookiesDeleted: e.cookiesDeleted, sitesKept: e.sitesKept.length, failures: e.failures.length, durationMs: e.durationMs })}`),
    "",
    `${t("reportWhatHappened")}:`,
    "",
  ];
  return lines.join("\n");
}

function aboutSection(s: Settings, log: LogEntry[]): HTMLElement {
  return h("section", { id: "about", "aria-labelledby": "h-about" },
    h("h2", { id: "h-about" }, t("sectionAbout")),
    h("div", { class: "setting" }, h("div", { class: "text" }, h("span", { class: "label" }, t("aboutVersion")), h("p", { class: "num" }, chrome.runtime.getManifest().version)), h("div", { class: "control" },
      isSet(CONFIG.changelogUrl) ? h("a", { href: CONFIG.changelogUrl, target: "_blank", rel: "noopener" }, t("aboutChangelog")) : null)),
    h("div", { class: "setting" }, h("div", { class: "text" }, h("span", { class: "label" }, t("aboutPrivacy")), h("p", {}, t("aboutPrivacyText"))), h("div", { class: "control" },
      isSet(CONFIG.privacyUrl) ? h("a", { href: CONFIG.privacyUrl, target: "_blank", rel: "noopener" }, t("aboutPrivacyPolicy")) : null)),
    h("div", { class: "setting" }, h("div", { class: "text" }, h("span", { class: "label" }, t("aboutReport")), h("p", {}, t("aboutReportText"))), h("div", { class: "control" },
      h("button", { class: "btn", onclick: async () => {
        const text = await reportText(s, log);
        if (isSet(CONFIG.newIssueUrl)) {
          await chrome.tabs.create({ url: `${CONFIG.newIssueUrl}${CONFIG.newIssueUrl.includes("?") ? "&" : "?"}body=${encodeURIComponent(text)}` });
          return;
        }
        const area = h("textarea", { readonly: true, "aria-label": t("aboutReport") });
        area.value = text;
        await confirmDialog({ title: t("aboutReport"), body: [t("reportCopyText"), area], confirm: t("actionCopy"), cancel: t("actionClose") }).then(async (copy) => {
          if (copy) await navigator.clipboard.writeText(text);
        });
      } }, t("actionReportProblem")))),
    h("div", { class: "setting" }, h("div", { class: "text" }, h("span", { class: "label" }, t("aboutLicence")), h("p", {}, t("aboutLicenceText"))), h("div", { class: "control" })),
    h("div", { class: "setting" }, h("div", { class: "text" }, h("span", { class: "label" }, t("aboutInspiration")), h("p", {}, t("aboutInspirationText"))), h("div", { class: "control" },
      h("a", { href: CONFIG.inspirationUrl, target: "_blank", rel: "noopener noreferrer" }, t("aboutInspirationLink")))),
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function renderNav(): void {
  clear(nav);
  nav.append(
    h("div", { class: "brand" }, h("span", { class: "brand-badge" }, mark("clean")), h("span", { class: "brand-name" }, t("productName"))),
    h("h1", { id: "page-title" }, t("settingsTitle")),
    h("ul", {}, ...SECTIONS.map((s) => h("li", {}, h("a", { href: `#${s.id}`, "data-section": s.id }, navIcon(s.id), t(s.title))))),
    h("p", { class: "nav-note" }, t("settingsLocalNote")),
  );
  updateNav();
}

function updateNav(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = (params.get("section") ?? (params.has("rule") ? "lists" : location.hash.slice(1))) || "lists";
  for (const a of nav.querySelectorAll<HTMLAnchorElement>("[data-section]")) {
    if (a.dataset.section === id) a.setAttribute("aria-current", "location");
    else a.removeAttribute("aria-current");
  }
}

async function render(): Promise<void> {
  const [settings, rules, logGot, incognito] = await Promise.all([
    loadSettings(storage),
    loadRules(storage, newId, Date.now()),
    storage.get("cleanupLog"),
    chrome.extension.isAllowedIncognitoAccess(),
  ]);
  const log = (logGot.cleanupLog ?? []) as LogEntry[];
  const scrollY = window.scrollY;
  const focusedId = (document.activeElement as HTMLElement | null)?.id;
  const openLogs = new Set([...document.querySelectorAll("details.log-entry[open]")].map((d, i) => i));
  clear(main);
  hideTooltip();
  main.append(h("div", { class: "page-heading" }, h("h2", {}, t("settingsIntroTitle")), h("p", {}, t("settingsIntroText"))), listsSection(rules), cleaningSection(settings, incognito), siteDataSection(settings), logSection(log), displaySection(settings), aboutSection(settings, log));
  [...document.querySelectorAll("details.log-entry")].forEach((d, i) => openLogs.has(i) && d.setAttribute("open", ""));
  window.scrollTo(0, scrollY);
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}

async function handleHash(): Promise<void> {
  hideTooltip();
  updateNav();
  const params = new URLSearchParams(location.hash.slice(1));
  const rule = params.get("rule");
  const section = params.get("section");
  if (rule) {
    view.editing = rule;
    await render();
    document.getElementById(`rule-${rule}`)?.scrollIntoView({ block: "center" });
  } else if (section) {
    document.getElementById(section)?.scrollIntoView();
  }
}

async function start(): Promise<void> {
  document.title = t("settingsTitle");
  renderNav();
  await render();
  await handleHash();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const busy = Boolean(document.querySelector("dialog[open]")) || (document.activeElement instanceof HTMLInputElement && document.activeElement.type !== "checkbox");
    if (changes.rules || changes.settings) {
      if (!busy) void render();
    } else if (changes.cleanupLog) {
      // Background cleanups only change the log: refresh that section alone, keeping open entries.
      void (async () => {
        const [settings, got] = await Promise.all([loadSettings(storage), storage.get("cleanupLog")]);
        const log = (got.cleanupLog ?? []) as LogEntry[];
        const old = document.getElementById("log");
        const open = new Set([...document.querySelectorAll("details.log-entry")].map((d, i) => (d.hasAttribute("open") ? i : -1)));
        const fresh = logSection(log);
        old?.replaceWith(fresh);
        [...fresh.querySelectorAll("details.log-entry")].forEach((d, i) => open.has(i) && d.setAttribute("open", ""));
        document.getElementById("about")?.replaceWith(aboutSection(settings, log));
      })();
    }
  });
  window.addEventListener("hashchange", () => void handleHash());
}

void start();

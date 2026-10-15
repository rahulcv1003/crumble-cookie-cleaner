/**
 * Welcome and first-run setup (PRD "First-run setup"). Automatic cleaning stays off until
 * the user makes the choice in step three; closing this tab early leaves it off, and the
 * popup offers to resume.
 */
import { plural, t } from "../../core/i18n";
import { applyImport, planCounts, planImport } from "../../core/import-export";
import type { SetupCandidates } from "../../core/messages";
import { createRule, parseRuleInput, type Rule } from "../../core/rules";
import { loadRules, loadSettings, saveRules, saveSettings } from "../../core/settings";
import { confirmDialog } from "../dialog";
import { clear, h, mark, send } from "../dom";
import { ruleErrorText, skipReasonText } from "../rule-text";

const storage = chrome.storage.local;
const newId = () => crypto.randomUUID();
const main = document.getElementById("main")!;
const live = document.getElementById("live")!;

type State = { step: 1 | 2 | 3 | 4; candidates: SetupCandidates; ticked: Set<string>; typed: string[]; errors: string[]; addText: string; imported: number };
const state: State = { step: 1, candidates: { open: [], top: [] }, ticked: new Set(), typed: [], errors: [], addText: "", imported: 0 };

function announce(text: string): void {
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
}

function pickRow(site: string, label: string, extra: string, id: string): HTMLElement {
  const box = h("input", { type: "checkbox", id, checked: state.ticked.has(site), onchange: (e: Event) => {
    if ((e.target as HTMLInputElement).checked) state.ticked.add(site);
    else state.ticked.delete(site);
  } });
  return h("li", {}, h("label", { for: id }, box, h("span", { class: "code" }, label)), h("span", { class: "count" }, extra));
}

function addTyped(): void {
  const parsed = parseRuleInput(state.addText);
  state.errors = parsed.errors.map(ruleErrorText);
  for (const p of parsed.patterns) {
    if (!state.typed.includes(p)) state.typed.push(p);
    state.ticked.add(p);
  }
  if (parsed.patterns.length) state.addText = "";
  render();
  document.getElementById("add-site")?.focus();
}

async function saveStepOne(): Promise<void> {
  const rules = await loadRules(storage, newId, Date.now());
  const existing = new Set(rules.map((r) => r.pattern));
  const added: Rule[] = [];
  for (const site of state.ticked) {
    const pattern = state.typed.includes(site) ? site : `*.${site}`;
    if (!existing.has(pattern)) added.push(createRule(pattern, "keep", newId, Date.now()));
  }
  await saveRules(storage, [...rules, ...added]);
  announce(plural("announceRulesAdded", added.length));
  state.step = 2;
  render();
}

async function importFromCad(file: File): Promise<void> {
  const rules = await loadRules(storage, newId, Date.now());
  const result = planImport(await file.text(), rules, newId, Date.now());
  if (!result.ok) {
    await confirmDialog({ title: t("importFailedTitle"), body: [t(result.error)], confirm: t("actionChooseAnotherFile"), cancel: t("actionClose") }).then((again) => {
      if (again) document.getElementById("cad-file")?.click();
    });
    return;
  }
  const plan = result.plan;
  let merge = false;
  const c0 = planCounts(plan, false);
  const counts = h("p", {}, t("importSummary", [plural("countRulesToAdd", c0.add), plural("countRulesToReplace", c0.replace), plural("countRulesSkipped", c0.skipped)]));
  const body: (Node | string)[] = [counts];
  const containerCount = Object.values(plan.containers).flat().length;
  if (containerCount > 0) {
    const upd = () => {
      const c = planCounts(plan, merge);
      counts.textContent = t("importSummary", [plural("countRulesToAdd", c.add), plural("countRulesToReplace", c.replace), plural("countRulesSkipped", c.skipped)]);
    };
    body.push(h("fieldset", {}, h("legend", {}, plural("importContainers", containerCount)),
      h("label", {}, h("input", { type: "radio", name: "containers", checked: true, onchange: () => { merge = false; upd(); } }), " ", t("importContainersSkip")),
      h("br", {}),
      h("label", {}, h("input", { type: "radio", name: "containers", onchange: () => { merge = true; upd(); } }), " ", t("importContainersMerge")),
    ));
  }
  if (plan.skipped.length) body.push(h("p", {}, t("importCannotImport")), h("ul", { class: "skipped" }, ...plan.skipped.map((s) => h("li", {}, skipReasonText(s.reason, s.expression)))));
  if (!(await confirmDialog({ title: t("importPreviewTitle"), body, confirm: t("actionImportRules"), cancel: t("actionCancel") }))) return;
  const fresh = await loadRules(storage, newId, Date.now());
  const next = applyImport(fresh, plan, merge);
  await saveRules(storage, next);
  state.imported = planCounts(plan, merge).add + planCounts(plan, merge).replace;
  announce(t("announceImported"));
  render();
}

async function finish(automatic: boolean): Promise<void> {
  await saveSettings(storage, { setupComplete: true, autoClean: automatic });
  finishedAutomatic = automatic;
  state.step = 4;
  render();
}

function stepClass(n: number): string {
  return state.step === n ? "" : state.step > n ? "done" : "inactive";
}

function render(): void {
  clear(main);
  const { open, top } = state.candidates;
  const stepOne = h("li", { class: stepClass(1), "aria-current": state.step === 1 ? "step" : undefined },
    h("div", {},
      h("h2", {}, t("setupStep1Title")),
      state.step !== 1
        ? h("p", { class: "sub" }, state.ticked.size === 0 ? t("setupStep1None") : plural("setupStep1Done", state.ticked.size))
        : h("div", {},
            h("p", { class: "sub" }, t("setupStep1Help")),
            open.length ? h("h3", {}, t("setupOpenNow")) : null,
            open.length ? h("ul", { class: "picks" }, ...open.map((o, i) => pickRow(o.site, o.label, "", `open-${i}`))) : h("p", { class: "sub" }, t("setupNoOpenSites")),
            top.length ? h("h3", {}, t("setupMostCookies")) : null,
            top.length ? h("ul", { class: "picks" }, ...top.map((o, i) => pickRow(o.site, o.label, plural("countCookies", o.cookies), `top-${i}`))) : null,
            state.typed.length ? h("ul", { class: "picks" }, ...state.typed.map((p, i) => pickRow(p, p, "", `typed-${i}`))) : null,
            h("div", { class: "add" },
              (() => {
                const input = h("input", { type: "text", id: "add-site", value: state.addText, placeholder: t("setupAddPlaceholder"), "aria-label": t("setupAddLabel") });
                input.addEventListener("input", () => (state.addText = input.value));
                input.addEventListener("keydown", (e) => {
                  if (e.key === "Enter") addTyped();
                });
                return input;
              })(),
              h("button", { class: "btn", onclick: addTyped }, t("actionAddSite")),
            ),
            state.errors.length ? h("ul", { class: "errors", role: "alert" }, ...state.errors.map((e) => h("li", {}, e))) : null,
            h("div", { class: "buttons" }, h("button", { class: "btn primary", id: "step1-next", onclick: saveStepOne }, state.ticked.size === 0 ? t("actionSkipKeep") : plural("actionKeepSelected", state.ticked.size))),
          ),
    ),
  );
  const fileInput = h("input", { type: "file", id: "cad-file", accept: ".json,application/json", class: "visually-hidden", "aria-label": t("actionImportFromCad"), onchange: async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (f) await importFromCad(f);
  } });
  const stepTwo = h("li", { class: stepClass(2), "aria-current": state.step === 2 ? "step" : undefined },
    h("div", {},
      h("h2", {}, t("setupStep2Title")),
      state.step === 2
        ? h("div", {},
            h("p", { class: "sub" }, t("setupStep2Help")),
            state.imported ? h("p", {}, plural("setupImported", state.imported)) : null,
            h("div", { class: "buttons" },
              h("button", { class: "btn", onclick: () => fileInput.click() }, t("actionImportFromCad")),
              h("button", { class: "btn primary", id: "step2-next", onclick: () => { state.step = 3; render(); } }, state.imported ? t("actionContinue") : t("actionSkipImport")),
              fileInput,
            ),
          )
        : h("p", { class: "sub" }, state.step > 2 ? (state.imported ? plural("setupImported", state.imported) : t("setupStep2Skipped")) : t("setupStep2Help")),
    ),
  );
  const stepThree = h("li", { class: stepClass(3), "aria-current": state.step === 3 ? "step" : undefined },
    h("div", {},
      h("h2", {}, t("setupStep3Title")),
      h("p", { class: "sub" }, t("setupStep3Help")),
      state.step === 3
        ? h("div", { class: "buttons" },
            h("button", { class: "btn primary", id: "start-auto", onclick: () => finish(true) }, t("actionStartAutomatic")),
            h("button", { class: "btn", id: "start-manual", onclick: () => finish(false) }, t("actionCleanManually")),
          )
        : null,
    ),
  );
  main.append(
    h("div", { class: "intro" },
      h("h1", {}, mark("clean"), t("welcomeTitle")),
      h("p", {}, t("welcomeLine1")),
      h("p", {}, t("welcomeLine2")),
      h("p", {}, t("welcomeLine3")),
    ),
    h("ol", { class: "steps" }, stepOne, stepTwo, stepThree),
  );
  if (state.step === 4) {
    main.append(h("div", { class: "finished", role: "status" }, h("p", {}, t(stateFinishedKey())), h("p", { class: "sub" }, t("setupFinishedHelp"))));
  }
}

let finishedAutomatic = false;
function stateFinishedKey(): string {
  return finishedAutomatic ? "setupFinishedAutomatic" : "setupFinishedManual";
}

async function start(): Promise<void> {
  document.title = t("welcomeTitle");
  const settings = await loadSettings(storage);
  const res = await send<{ ok: boolean; candidates: SetupCandidates }>({ type: "setupCandidates" });
  state.candidates = res.candidates;
  for (const o of state.candidates.open) state.ticked.add(o.site);
  if (settings.setupComplete) {
    finishedAutomatic = settings.autoClean;
    state.step = 4;
  }
  render();
}

void start();

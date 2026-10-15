/**
 * Import and export of rules (PRD "Import and export").
 *
 * Export writes the Cookie AutoDelete expressions format, so files move between the
 * two. Each expression also carries a "crumble" field with this extension's full rule
 * (options, note, id), which Cookie AutoDelete ignores; importing our own export
 * therefore restores identical rules.
 *
 * Imported files are untrusted: size and rule-count limits, strict shape checks, every
 * pattern validated like typed input. Nothing is applied until the user confirms a plan.
 * Pure functions; no browser APIs.
 */
import { createRule, DEFAULT_RULE_SITE_DATA, normalizePattern, splitRuleInput, validatePattern, type ListType, type Rule, type RuleErrorCode } from "./rules";

export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_RULES = 10_000;
export const DEFAULT_CONTAINER = "default";

type CrumbleExtra = Pick<Rule, "id" | "list" | "cookies" | "siteData" | "createdAt"> & { note?: string; pattern: string };

export type CadExpression = {
  expression: string;
  listType: "WHITE" | "GREY";
  storeId: string;
  cookieNames?: string[];
  cleanAllCookies?: boolean;
  cleanLocalStorage?: boolean;
  id?: string;
  crumble?: CrumbleExtra;
};

/** Error codes map to locale messages "importError<Code>". */
export type ImportErrorCode = "importErrorTooLarge" | "importErrorNotJson" | "importErrorWrongShape" | "importErrorTooManyRules" | "importErrorEmpty";

export type SkipReason =
  | { code: "importSkipNotText" }
  | { code: "importSkipUnknownList"; detail: string }
  | { code: "importSkipIpRange" }
  | { code: RuleErrorCode; detail?: string };

export type PlannedRule = { rule: Rule; container: string; replaces: Rule | null };
export type SkippedRule = { expression: string; container: string; reason: SkipReason };

export type ImportPlan = {
  /** Rules from the main ("default") list. */
  main: PlannedRule[];
  /** Rules from Firefox container lists, by container id; the user chooses merge or skip. */
  containers: Record<string, PlannedRule[]>;
  skipped: SkippedRule[];
};

export type ImportResult = { ok: true; plan: ImportPlan } | { ok: false; error: ImportErrorCode };

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function toCadExpression(rule: Rule): CadExpression {
  const named = rule.cookies.mode === "named";
  const expr: CadExpression = {
    expression: rule.pattern,
    listType: rule.list === "keep" ? "WHITE" : "GREY",
    storeId: DEFAULT_CONTAINER,
    cookieNames: named ? [...(rule.cookies as { names: string[] }).names] : [],
    cleanAllCookies: !named,
    cleanLocalStorage: rule.siteData.localStorage === "clean",
    id: rule.id,
    crumble: {
      id: rule.id,
      pattern: rule.pattern,
      list: rule.list,
      cookies: named ? { mode: "named", names: [...(rule.cookies as { names: string[] }).names] } : { mode: "all" },
      siteData: { ...rule.siteData },
      createdAt: rule.createdAt,
      ...(rule.note !== undefined ? { note: rule.note } : {}),
    },
  };
  return expr;
}

/** The export file contents (Cookie AutoDelete format, pretty-printed). */
export function exportRules(rules: readonly Rule[]): string {
  return `${JSON.stringify({ [DEFAULT_CONTAINER]: rules.map(toCadExpression) }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Removes // and /* *\/ comments outside strings (the Cookie AutoDelete documentation's example has one). */
export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += ch;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const IP_RANGE = /^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-f:]*:[0-9a-f:.]*)\/\d{1,3}$/i;

function validCrumbleExtra(v: unknown): v is CrumbleExtra {
  if (!isRecord(v)) return false;
  const c = v.cookies;
  const sd = v.siteData;
  return (
    typeof v.id === "string" &&
    typeof v.pattern === "string" &&
    (v.list === "keep" || v.list === "restart") &&
    typeof v.createdAt === "number" &&
    isRecord(c) &&
    (c.mode === "all" || (c.mode === "named" && Array.isArray(c.names) && c.names.every((n) => typeof n === "string"))) &&
    isRecord(sd) &&
    Object.keys(DEFAULT_RULE_SITE_DATA).every((k) => sd[k] === "keep" || sd[k] === "clean") &&
    (v.note === undefined || typeof v.note === "string")
  );
}

/**
 * Reads an import file into a plan: what would be added, what would replace an existing
 * rule (same pattern), and what cannot be imported, with reasons. Changes nothing.
 */
export function planImport(text: string, existing: readonly Rule[], idFactory: () => string, now: number): ImportResult {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) return { ok: false, error: "importErrorTooLarge" };
  if (text.trim() === "") return { ok: false, error: "importErrorEmpty" };
  let data: unknown;
  try {
    data = JSON.parse(stripJsonComments(text));
  } catch {
    return { ok: false, error: "importErrorNotJson" };
  }
  if (!isRecord(data) || Object.keys(data).length === 0 || !Object.values(data).every(Array.isArray)) {
    return { ok: false, error: "importErrorWrongShape" };
  }
  const total = Object.values(data).reduce<number>((n, list) => n + (list as unknown[]).length, 0);
  if (total > IMPORT_MAX_RULES) return { ok: false, error: "importErrorTooManyRules" };

  const byPattern = new Map(existing.map((r) => [r.pattern, r]));
  const plan: ImportPlan = { main: [], containers: {}, skipped: [] };
  const seen = new Map<string, PlannedRule>(); // container + pattern -> planned (later duplicates in a list win)
  let count = 0;

  for (const [container, list] of Object.entries(data)) {
    for (const raw of list as unknown[]) {
      if (!isRecord(raw) || typeof raw.expression !== "string") {
        plan.skipped.push({ expression: isRecord(raw) ? String(raw.expression ?? "") : "", container, reason: { code: "importSkipNotText" } });
        continue;
      }
      if (raw.listType !== "WHITE" && raw.listType !== "GREY") {
        plan.skipped.push({ expression: raw.expression, container, reason: { code: "importSkipUnknownList", detail: String(raw.listType) } });
        continue;
      }
      const list: ListType = raw.listType === "WHITE" ? "keep" : "restart";
      const names = Array.isArray(raw.cookieNames) ? raw.cookieNames.filter((n): n is string => typeof n === "string" && n !== "") : [];
      const named = names.length > 0 && raw.cleanAllCookies === false;

      for (const piece of splitRuleInput(raw.expression)) {
        count++;
        if (count > IMPORT_MAX_RULES) return { ok: false, error: "importErrorTooManyRules" };
        if (IP_RANGE.test(piece)) {
          plan.skipped.push({ expression: piece, container, reason: { code: "importSkipIpRange" } });
          continue;
        }
        const err = validatePattern(piece);
        if (err) {
          plan.skipped.push({ expression: piece, container, reason: { code: err.code, ...(err.substitutions[1] ? { detail: err.substitutions[1] } : {}) } });
          continue;
        }
        const pattern = normalizePattern(piece);
        let rule: Rule;
        const extra = raw.crumble;
        if (validCrumbleExtra(extra) && normalizePattern(extra.pattern) === pattern) {
          rule = {
            id: extra.id,
            pattern,
            list: extra.list,
            cookies: extra.cookies.mode === "named" ? { mode: "named", names: [...extra.cookies.names] } : { mode: "all" },
            siteData: { ...extra.siteData },
            createdAt: extra.createdAt,
            ...(extra.note !== undefined ? { note: extra.note } : {}),
          };
        } else {
          rule = createRule(pattern, list, idFactory, now);
          if (named) rule.cookies = { mode: "named", names: [...new Set(names)] };
          if (raw.cleanLocalStorage === true) rule.siteData.localStorage = "clean";
        }
        const replaces = byPattern.get(pattern) ?? null;
        if (replaces) rule.id = replaces.id;
        const planned: PlannedRule = { rule, container, replaces };
        const seenKey = `${container}\u0000${pattern}`;
        const prev = seen.get(seenKey);
        if (prev) {
          const bucket = prev.container === DEFAULT_CONTAINER ? plan.main : plan.containers[prev.container]!;
          bucket.splice(bucket.indexOf(prev), 1);
        }
        seen.set(seenKey, planned);
        if (container === DEFAULT_CONTAINER) plan.main.push(planned);
        else (plan.containers[container] ??= []).push(planned);
      }
    }
  }
  for (const [k, v] of Object.entries(plan.containers)) if (v.length === 0) delete plan.containers[k];
  return { ok: true, plan };
}

/** Applies a confirmed plan to the current rules. Container lists are merged only when asked. */
export function applyImport(existing: readonly Rule[], plan: ImportPlan, mergeContainers: boolean): Rule[] {
  const incoming = [...plan.main, ...(mergeContainers ? Object.values(plan.containers).flat() : [])].map((p) => p.rule);
  const byPattern = new Map(existing.map((r) => [r.pattern, r] as const));
  const out = existing.map((r) => ({ ...r }));
  for (const rule of incoming) {
    const old = byPattern.get(rule.pattern);
    if (old) out[out.findIndex((r) => r.pattern === rule.pattern)] = rule;
    else {
      out.push(rule);
      byPattern.set(rule.pattern, rule);
    }
  }
  return out;
}

/** Counts for the preview: rules to add, rules that replace existing ones. */
export function planCounts(plan: ImportPlan, mergeContainers: boolean): { add: number; replace: number; skipped: number; container: number } {
  const used = [...plan.main, ...(mergeContainers ? Object.values(plan.containers).flat() : [])];
  return {
    add: used.filter((p) => !p.replaces).length,
    replace: used.filter((p) => p.replaces).length,
    skipped: plan.skipped.length,
    container: Object.values(plan.containers).flat().length,
  };
}

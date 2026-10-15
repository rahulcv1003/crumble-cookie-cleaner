/**
 * Keep / Keep until restart rules: parsing, validation and matching.
 *
 * Syntax (same as Cookie AutoDelete, see the PRD "Rules" section):
 *   example.com      matches example.com and www.example.com only
 *   *.example.com    matches example.com and every subdomain
 *   *                wildcard anywhere (gi*b.com matches github.com, gitlab.com, gib.com)
 *   /pattern/        regular expression tested against the hostname (case-insensitive)
 *   a.com, *.b.com   several rules at once, separated by commas
 * A leading "www." in a hostname is ignored when matching.
 * Keep takes priority over Keep until restart.
 *
 * Glob patterns are matched with a linear wildcard matcher, not a RegExp,
 * so a pattern with many "*" cannot cause catastrophic backtracking.
 *
 * Pure functions only: no browser API calls, no module-level state.
 */
import { normalizeHost, toUnicodeHost } from "./hosts";

export type ListType = "keep" | "restart";
export type SiteDataChoice = "keep" | "clean";

export type Rule = {
  id: string;
  pattern: string; // as typed: "example.com", "*.example.com", "/regex/"
  list: ListType;
  cookies: { mode: "all" } | { mode: "named"; names: string[] };
  siteData: {
    localStorage: SiteDataChoice;
    indexedDB: SiteDataChoice;
    cacheStorage: SiteDataChoice;
    serviceWorkers: SiteDataChoice;
  };
  note?: string;
  createdAt: number;
};

export const REGEX_MAX_LENGTH = 200;
/**
 * Most unbounded repeats (*, +, {n,}) a rule regex may contain. Measured in V8 on a
 * 253-character hostname: 2 repeats worst case about 20 ms, 3 about 1.2 s, 4 about 60 s.
 */
export const REGEX_MAX_UNBOUNDED_REPEATS = 2;

/** Error codes map 1:1 to message names in src/_locales/en/messages.json. */
export type RuleErrorCode =
  | "ruleErrorEmpty"
  | "ruleErrorRegexEmpty"
  | "ruleErrorRegexUnclosed"
  | "ruleErrorRegexTooLong"
  | "ruleErrorRegexUnsafe"
  | "ruleErrorRegexUnterminatedClass"
  | "ruleErrorRegexUnterminatedGroup"
  | "ruleErrorRegexUnmatchedParen"
  | "ruleErrorRegexNothingToRepeat"
  | "ruleErrorRegexRangeOrder"
  | "ruleErrorRegexTrailingBackslash"
  | "ruleErrorRegexQuantifierOrder"
  | "ruleErrorRegexOther";

export const RULE_ERROR_CODES: readonly RuleErrorCode[] = [
  "ruleErrorEmpty",
  "ruleErrorRegexEmpty",
  "ruleErrorRegexUnclosed",
  "ruleErrorRegexTooLong",
  "ruleErrorRegexUnsafe",
  "ruleErrorRegexUnterminatedClass",
  "ruleErrorRegexUnterminatedGroup",
  "ruleErrorRegexUnmatchedParen",
  "ruleErrorRegexNothingToRepeat",
  "ruleErrorRegexRangeOrder",
  "ruleErrorRegexTrailingBackslash",
  "ruleErrorRegexQuantifierOrder",
  "ruleErrorRegexOther",
];

export type RuleError = {
  code: RuleErrorCode;
  /** Substitutions for the locale message: [pattern] or [pattern, detail]. */
  substitutions: string[];
};

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

export function isRegexPattern(pattern: string): boolean {
  return pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/");
}

/**
 * Splits user input into individual patterns on commas, trimming spaces.
 * A comma inside a /regex/ (for example /a{1,3}\.com/) does not split it:
 * a token that starts with "/" runs until the "/" that is followed by a
 * comma or the end of the input.
 */
export function splitRuleInput(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    while (i < n && /\s/.test(input[i]!)) i++;
    if (i >= n) break;
    let token: string;
    if (input[i] === "/") {
      // Find a closing "/" (not escaped) followed by optional spaces then "," or end.
      let j = i + 1;
      let end = -1;
      while (j < n) {
        const ch = input[j]!;
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === "/") {
          let k = j + 1;
          while (k < n && /\s/.test(input[k]!)) k++;
          if (k >= n || input[k] === ",") {
            end = j;
            break;
          }
        }
        j++;
      }
      if (end === -1) {
        // No proper closing slash: fall back to splitting at the next comma.
        const comma = input.indexOf(",", i);
        end = comma === -1 ? n - 1 : comma - 1;
      }
      token = input.slice(i, end + 1);
      i = end + 1;
      while (i < n && input[i] !== ",") i++;
      i++; // skip the comma
    } else {
      const comma = input.indexOf(",", i);
      const stop = comma === -1 ? n : comma;
      token = input.slice(i, stop);
      i = stop + 1;
    }
    token = token.trim();
    if (token !== "") out.push(token);
  }
  return out;
}

/** Normalises one pattern as stored: trims; lowercases globs (hostnames are case-insensitive). Regexes keep their case. */
export function normalizePattern(pattern: string): string {
  const trimmed = pattern.trim();
  return isRegexPattern(trimmed) ? trimmed : trimmed.toLowerCase();
}

const V8_REGEX_ERRORS: [RegExp, RuleErrorCode][] = [
  [/Unterminated character class/i, "ruleErrorRegexUnterminatedClass"],
  [/Unterminated group/i, "ruleErrorRegexUnterminatedGroup"],
  [/Unmatched '\)'/i, "ruleErrorRegexUnmatchedParen"],
  [/Nothing to repeat/i, "ruleErrorRegexNothingToRepeat"],
  [/Range out of order/i, "ruleErrorRegexRangeOrder"],
  [/\\ at end of pattern/i, "ruleErrorRegexTrailingBackslash"],
  [/numbers out of order/i, "ruleErrorRegexQuantifierOrder"],
];

/**
 * Detects the classic shapes of catastrophic backtracking: a group repeated
 * with *, + or {n,} that itself contains *, + or {n,} (for example (a+)+ or
 * (\w+\.)*), or that contains an alternation (for example (a|aa)+).
 * Conservative on purpose; hostnames are short, but a hung service worker
 * would stop all cleaning.
 */
export function hasNestedUnboundedRepetition(source: string): boolean {
  type Frame = { unbounded: boolean; alternation: boolean };
  const stack: Frame[] = [];
  let inClass = false;
  const isUnboundedAt = (idx: number): boolean => {
    const ch = source[idx];
    if (ch === "*" || ch === "+") return true;
    if (ch === "{") return /^\{\d+,\}/.test(source.slice(idx));
    return false;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ unbounded: false, alternation: false });
      continue;
    }
    if (ch === "|") {
      const top = stack[stack.length - 1];
      if (top) top.alternation = true;
      continue;
    }
    if (ch === ")") {
      const inner = stack.pop() ?? { unbounded: false, alternation: false };
      const outerUnbounded = isUnboundedAt(i + 1);
      if (outerUnbounded && (inner.unbounded || inner.alternation)) return true;
      const parent = stack[stack.length - 1];
      if (parent && (inner.unbounded || outerUnbounded)) parent.unbounded = true;
      continue;
    }
    if (isUnboundedAt(i)) {
      const top = stack[stack.length - 1];
      if (top) top.unbounded = true;
    }
  }
  return false;
}

/** Counts unbounded repeats (*, +, {n,}) outside character classes. */
export function countUnboundedRepeats(source: string): number {
  let count = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "*" || ch === "+") count++;
    else if (ch === "{" && /^\{\d+,\}/.test(source.slice(i))) count++;
  }
  return count;
}

/** True when matching this regex against a long hostname could take too long. */
export function isSlowRegex(source: string): boolean {
  return hasNestedUnboundedRepetition(source) || countUnboundedRepeats(source) > REGEX_MAX_UNBOUNDED_REPEATS;
}

/** Validates one pattern. Returns null when it can be saved. */
export function validatePattern(rawPattern: string): RuleError | null {
  const pattern = normalizePattern(rawPattern);
  if (pattern === "") return { code: "ruleErrorEmpty", substitutions: [] };
  if (!isRegexPattern(pattern)) {
    // A site name never starts with "/": this is a regular expression missing its closing slash.
    if (pattern.startsWith("/")) return { code: "ruleErrorRegexUnclosed", substitutions: [pattern] };
    return null;
  }
  const source = pattern.slice(1, -1);
  if (source.trim() === "") return { code: "ruleErrorRegexEmpty", substitutions: [pattern] };
  if (source.length > REGEX_MAX_LENGTH) return { code: "ruleErrorRegexTooLong", substitutions: [pattern] };
  try {
    new RegExp(source, "i");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    for (const [re, code] of V8_REGEX_ERRORS) {
      if (re.test(message)) return { code, substitutions: [pattern] };
    }
    const detail = message.includes(": ") ? message.slice(message.lastIndexOf(": ") + 2) : message;
    return { code: "ruleErrorRegexOther", substitutions: [pattern, detail] };
  }
  if (isSlowRegex(source)) return { code: "ruleErrorRegexUnsafe", substitutions: [pattern] };
  return null;
}

export type ParsedRuleInput = {
  /** Valid, normalised, de-duplicated patterns, in input order. */
  patterns: string[];
  /** One entry per rejected pattern. Nothing is saved for these. */
  errors: RuleError[];
};

/** Parses a comma-separated rule entry such as "a.com, *.b.com ,/c/". */
export function parseRuleInput(input: string): ParsedRuleInput {
  const tokens = splitRuleInput(input);
  if (tokens.length === 0) return { patterns: [], errors: [{ code: "ruleErrorEmpty", substitutions: [] }] };
  const patterns: string[] = [];
  const errors: RuleError[] = [];
  for (const token of tokens) {
    const error = validatePattern(token);
    if (error) {
      errors.push(error);
      continue;
    }
    const normalized = normalizePattern(token);
    if (!patterns.includes(normalized)) patterns.push(normalized);
  }
  return { patterns, errors };
}

// ---------------------------------------------------------------------------
// Rule objects
// ---------------------------------------------------------------------------

export const DEFAULT_RULE_SITE_DATA: Rule["siteData"] = Object.freeze({
  localStorage: "keep",
  indexedDB: "keep",
  cacheStorage: "keep",
  serviceWorkers: "keep",
}) as Rule["siteData"];

/** Creates a rule with default options (keep all cookies, keep all site data). */
export function createRule(
  pattern: string,
  list: ListType,
  idFactory: () => string,
  now: number,
): Rule {
  return {
    id: idFactory(),
    pattern: normalizePattern(pattern),
    list,
    cookies: { mode: "all" },
    siteData: { ...DEFAULT_RULE_SITE_DATA },
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Linear-time-per-position wildcard match: "*" matches any run of characters (including none). */
export function wildcardMatch(glob: string, text: string): boolean {
  let g = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (g < glob.length && glob[g] !== "*" && glob[g] === text[t]) {
      g++;
      t++;
    } else if (g < glob.length && glob[g] === "*") {
      star = g++;
      mark = t;
    } else if (star !== -1) {
      g = star + 1;
      t = ++mark;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === "*") g++;
  return g === glob.length;
}

export type CompiledPattern = (host: string) => boolean;

function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Every form of a host a pattern may be written against: ASCII and Unicode, with and without "www.". */
export function hostCandidates(host: string): string[] {
  const ascii = normalizeHost(host);
  const unicode = toUnicodeHost(ascii);
  const set = new Set<string>([stripWww(ascii), ascii, stripWww(unicode), unicode]);
  return [...set];
}

/**
 * Compiles a validated pattern into a matcher. Call validatePattern first;
 * an invalid regex compiles to a matcher that never matches.
 */
export function compilePattern(rawPattern: string): CompiledPattern {
  const pattern = normalizePattern(rawPattern);
  if (isRegexPattern(pattern)) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern.slice(1, -1), "i");
    } catch {
      return () => false;
    }
    return (host) => hostCandidates(host).some((h) => regex.test(h));
  }

  // Glob. Compare in both ASCII and Unicode form so a rule written either way matches both.
  const forms = new Set<string>();
  const addForm = (p: string) => {
    forms.add(p);
    if (!p.includes("*")) {
      const ascii = normalizeHost(p);
      forms.add(ascii);
      forms.add(toUnicodeHost(ascii));
    }
  };
  const subdomains = pattern.startsWith("*.");
  const body = stripWww(subdomains ? pattern.slice(2) : pattern);
  addForm(body);
  const globs = [...forms];

  return (host) => {
    for (const candidate of hostCandidates(host)) {
      for (const glob of globs) {
        if (wildcardMatch(glob, candidate)) return true;
        if (subdomains) {
          // Try every suffix that starts after a "." boundary.
          for (let i = candidate.indexOf("."); i !== -1; i = candidate.indexOf(".", i + 1)) {
            if (wildcardMatch(glob, candidate.slice(i + 1))) return true;
          }
        }
      }
    }
    return false;
  };
}

export type CompiledRule = { rule: Rule; matches: CompiledPattern };

/** Compiles a rule list once per run. Pass the result to the matching helpers. */
export function compileRules(rules: readonly Rule[]): CompiledRule[] {
  return rules.map((rule) => ({ rule, matches: compilePattern(rule.pattern) }));
}

export type HostClassification = {
  /** "keep" if any Keep rule matches, else "restart" if any Keep until restart rule matches, else null. */
  list: ListType | null;
  keepRules: Rule[];
  restartRules: Rule[];
};

/** Which list a host is on. Keep takes priority over Keep until restart. Rule order does not matter. */
export function classifyHost(compiled: readonly CompiledRule[], host: string): HostClassification {
  const keepRules: Rule[] = [];
  const restartRules: Rule[] = [];
  for (const { rule, matches } of compiled) {
    if (!matches(host)) continue;
    if (rule.list === "keep") keepRules.push(rule);
    else restartRules.push(rule);
  }
  const list: ListType | null = keepRules.length > 0 ? "keep" : restartRules.length > 0 ? "restart" : null;
  return { list, keepRules, restartRules };
}

/**
 * Whether any of the given (already matching) rules keeps a cookie with this name.
 * "Keep all cookies" keeps every name; "Keep only these cookies" keeps the listed
 * names only (cookie names are case-sensitive). Several matching rules combine:
 * a cookie is kept if any of them keeps it.
 */
export function rulesKeepCookie(matchingRules: readonly Rule[], cookieName: string): boolean {
  return matchingRules.some((rule) => rule.cookies.mode === "all" || rule.cookies.names.includes(cookieName));
}

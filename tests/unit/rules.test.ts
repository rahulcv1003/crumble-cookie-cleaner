import { describe, expect, it } from "vitest";
import messages from "../../src/_locales/en/messages.json";
import {
  classifyHost,
  compilePattern,
  compileRules,
  createRule,
  countUnboundedRepeats,
  hasNestedUnboundedRepetition,
  parseRuleInput,
  RULE_ERROR_CODES,
  rulesKeepCookie,
  splitRuleInput,
  validatePattern,
  wildcardMatch,
  type Rule,
  type RuleError,
} from "../../src/core/rules";

let n = 0;
const id = () => `r${++n}`;
const rule = (pattern: string, list: Rule["list"] = "keep", cookies?: Rule["cookies"]): Rule => {
  const r = createRule(pattern, list, id, 0);
  if (cookies) r.cookies = cookies;
  return r;
};
const matches = (pattern: string, host: string) => compilePattern(pattern)(host);

/** Renders an error the way chrome.i18n.getMessage would, from the locale file. */
function render(error: RuleError): string {
  const entry = (messages as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>)[error.code];
  if (!entry) throw new Error(`missing locale message ${error.code}`);
  let text = entry.message;
  for (const [name, ph] of Object.entries(entry.placeholders ?? {})) {
    const idx = Number(ph.content.slice(1)) - 1;
    text = text.replaceAll(`$${name.toUpperCase()}$`, error.substitutions[idx] ?? "");
  }
  return text;
}

describe("Rule matching", () => {
  it("RUL-01 example.com matches example.com and www.example.com only", () => {
    expect(matches("example.com", "example.com")).toBe(true);
    expect(matches("example.com", "www.example.com")).toBe(true);
    expect(matches("example.com", "mail.example.com")).toBe(false);
    // also: case-insensitive, trailing dot, cookie-style leading dot
    expect(matches("Example.COM", "EXAMPLE.com.")).toBe(true);
    expect(matches("example.com", ".example.com")).toBe(true);
  });

  it("RUL-02 *.example.com matches example.com and every subdomain, not notexample.com", () => {
    expect(matches("*.example.com", "example.com")).toBe(true);
    expect(matches("*.example.com", "a.b.example.com")).toBe(true);
    expect(matches("*.example.com", "notexample.com")).toBe(false);
    expect(matches("*.example.com", "www.example.com")).toBe(true);
    expect(matches("*.example.com", "example.com.evil.net")).toBe(false);
  });

  it("RUL-03 gi*b.com matches github.com, gitlab.com, gib.com but not github.org", () => {
    expect(matches("gi*b.com", "github.com")).toBe(true);
    expect(matches("gi*b.com", "gitlab.com")).toBe(true);
    expect(matches("gi*b.com", "gib.com")).toBe(true);
    expect(matches("gi*b.com", "github.org")).toBe(false);
  });

  it("RUL-04 * matches every hostname", () => {
    for (const host of ["example.com", "a.b.c.d.e", "localhost", "127.0.0.1", "xn--bcher-kva.de", "www.x.y"]) {
      expect(matches("*", host)).toBe(true);
    }
  });

  it("RUL-05 /google\\.(ca|com)/ matches google.ca and google.com, not google.de", () => {
    expect(validatePattern("/google\\.(ca|com)/")).toBeNull();
    expect(matches("/google\\.(ca|com)/", "google.ca")).toBe(true);
    expect(matches("/google\\.(ca|com)/", "google.com")).toBe(true);
    expect(matches("/google\\.(ca|com)/", "google.de")).toBe(false);
  });

  it("RUL-06 'a.com, *.b.com ,/c/' creates three rules with spaces trimmed", () => {
    const parsed = parseRuleInput("a.com, *.b.com ,/c/");
    expect(parsed.errors).toEqual([]);
    expect(parsed.patterns).toEqual(["a.com", "*.b.com", "/c/"]);
    // PRD acceptance example
    expect(parseRuleInput("a.com, *.b.com, /c\\.(com|net)/").patterns).toEqual(["a.com", "*.b.com", "/c\\.(com|net)/"]);
    // a comma inside a regex does not split it
    expect(splitRuleInput("/a{1,3}\\.com/, b.com")).toEqual(["/a{1,3}\\.com/", "b.com"]);
    // empty entries between commas are ignored; an empty input is an error
    expect(parseRuleInput("a.com,, ,b.com").patterns).toEqual(["a.com", "b.com"]);
    expect(parseRuleInput("  ,  ").errors[0]?.code).toBe("ruleErrorEmpty");
  });

  it("RUL-07 invalid regex /[a-/ is rejected with a message naming the problem", () => {
    const parsed = parseRuleInput("/[a-/");
    expect(parsed.patterns).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    const err = parsed.errors[0]!;
    expect(err.code).toBe("ruleErrorRegexUnterminatedClass");
    const text = render(err);
    expect(text).toContain("/[a-/");
    expect(text).toMatch(/\[ without a closing \]/);
    // other common problems each get a specific message
    const cases: [string, string][] = [
      ["/(abc/", "ruleErrorRegexUnterminatedGroup"],
      ["/abc)/", "ruleErrorRegexUnmatchedParen"],
      ["/*abc/", "ruleErrorRegexNothingToRepeat"],
      ["/[z-a]/", "ruleErrorRegexRangeOrder"],
      ["/abc\\/", "ruleErrorRegexTrailingBackslash"],
      ["/a{3,1}/", "ruleErrorRegexQuantifierOrder"],
      ["//", "ruleErrorRegexEmpty"],
      ["/abc", "ruleErrorRegexUnclosed"],
    ];
    for (const [pattern, code] of cases) expect(validatePattern(pattern)?.code, pattern).toBe(code);
    // anything else falls back to a message that includes the browser's own description
    const other = validatePattern("/(?<1a>x)/");
    expect(other?.code).toBe("ruleErrorRegexOther");
    expect(render(other!)).toMatch(/\(.+\)/);
    // a rejected pattern in a mixed entry does not block the valid ones
    const mixed = parseRuleInput("a.com, /[a-/, b.com");
    expect(mixed.patterns).toEqual(["a.com", "b.com"]);
    expect(mixed.errors.map((e) => e.code)).toEqual(["ruleErrorRegexUnterminatedClass"]);
  });

  it("RUL-08 a regex longer than 200 characters is rejected", () => {
    const ok = `/${"a".repeat(200)}/`;
    const tooLong = `/${"a".repeat(201)}/`;
    expect(validatePattern(ok)).toBeNull();
    expect(validatePattern(tooLong)?.code).toBe("ruleErrorRegexTooLong");
    expect(parseRuleInput(tooLong).patterns).toEqual([]);
  });

  it("RUL-08b catastrophic-backtracking shapes are rejected and accepted patterns match fast (time-boxed)", () => {
    for (const p of ["/(a+)+$/", "/(a*)*b/", "/(\\w+\\.)*x$/", "/(a|aa){2,}$/", "/(a|aa)+$/", "/((ab)*)+$/"]) {
      expect(validatePattern(p)?.code, p).toBe("ruleErrorRegexUnsafe");
    }
    expect(hasNestedUnboundedRepetition("(.+\\.)?google\\.com")).toBe(false);
    expect(hasNestedUnboundedRepetition("google\\.(ca|com)")).toBe(false);
    expect(hasNestedUnboundedRepetition("(www\\.)?google\\.(ca|com)")).toBe(false);
    expect(hasNestedUnboundedRepetition("^(a|b)*c$")).toBe(true);
    expect(hasNestedUnboundedRepetition("[(+)]+")).toBe(false);

    // More than two unbounded repeats is rejected (polynomial blow-up on long hostnames).
    expect(validatePattern("/a.*a.*a.*b/")?.code).toBe("ruleErrorRegexUnsafe");
    expect(validatePattern("/^.*\\.example\\.(com|net)$/")).toBeNull();
    expect(validatePattern("/[*+]+x/")).toBeNull(); // * and + inside a class are literal
    expect(countUnboundedRepeats("a{2,}b+[*]c\\*")).toBe(2);

    // Time box: every accepted pattern matches the worst-case 253-character hostnames quickly.
    const long = `${"a".repeat(63)}.${"a".repeat(63)}.${"a".repeat(63)}.${"a".repeat(61)}`;
    const hosts = [long, "a".repeat(253), `${"a".repeat(252)}.`];
    const patterns = [
      "*a*a*a*a*a*a*a*a*a*a*a*a*b",
      "*.*a*a*a*a*a*a*a*b.com",
      "/a.*a.*b/",
      "/a+a+b/",
      "/^(?:a|b)?[ab]*c$/",
      "/(.+\\.)?google\\.com/",
      "*",
    ];
    for (const p of patterns) {
      expect(validatePattern(p), p).toBeNull();
      const m = compilePattern(p);
      for (const h of hosts) {
        const start = performance.now();
        m(h);
        expect(performance.now() - start, `${p} on ${h.length} chars`).toBeLessThan(100);
      }
    }
  });

  it("RUL-09 a site on both lists is treated as Keep", () => {
    const compiled = compileRules([rule("*.example.com", "restart"), rule("example.com", "keep")]);
    const result = classifyHost(compiled, "www.example.com");
    expect(result.list).toBe("keep");
    expect(result.restartRules).toHaveLength(1);
    // order does not matter
    expect(classifyHost(compileRules([rule("example.com", "keep"), rule("*.example.com", "restart")]), "example.com").list).toBe("keep");
    // restart only, and none
    expect(classifyHost(compiled, "mail.example.com").list).toBe("restart");
    expect(classifyHost(compiled, "other.com").list).toBeNull();
  });

  it("RUL-10 Keep rule with named cookies sid, lang keeps only those names (unit part)", () => {
    const keep = rule("example.com", "keep", { mode: "named", names: ["sid", "lang"] });
    const { keepRules } = classifyHost(compileRules([keep]), "www.example.com");
    expect(rulesKeepCookie(keepRules, "sid")).toBe(true);
    expect(rulesKeepCookie(keepRules, "lang")).toBe(true);
    expect(rulesKeepCookie(keepRules, "tracking")).toBe(false);
    expect(rulesKeepCookie(keepRules, "SID")).toBe(false); // cookie names are case-sensitive
    // a second matching "keep all" rule keeps everything
    const both = classifyHost(compileRules([keep, rule("*.example.com", "keep")]), "example.com");
    expect(rulesKeepCookie(both.keepRules, "tracking")).toBe(true);
    // default option is "keep all cookies"
    expect(rulesKeepCookie([rule("x.com")], "anything")).toBe(true);
  });

  it("RUL-11 internationalised domain: a rule written in Unicode or punycode matches both", () => {
    const forms = ["bücher.de", "xn--bcher-kva.de", "www.bücher.de", "BÜCHER.de"];
    for (const pattern of ["bücher.de", "xn--bcher-kva.de", "*.bücher.de", "*.xn--bcher-kva.de"]) {
      for (const host of forms) expect(matches(pattern, host), `${pattern} vs ${host}`).toBe(true);
      expect(matches(pattern, "buecher.de"), pattern).toBe(false);
    }
    expect(matches("*.bücher.de", "shop.xn--bcher-kva.de")).toBe(true);
    expect(matches("bü*er.de", "xn--bcher-kva.de")).toBe(true);
    expect(matches("/bücher\\.de$/", "xn--bcher-kva.de")).toBe(true);
    expect(matches("/xn--bcher-kva\\.de$/", "bücher.de")).toBe(true);
  });

  it("every rule error code has a locale message (PER-04 support)", () => {
    for (const code of RULE_ERROR_CODES) expect(messages, code).toHaveProperty(code);
  });

  it("wildcardMatch basics", () => {
    expect(wildcardMatch("a*c", "abbbc")).toBe(true);
    expect(wildcardMatch("a*c", "abbbd")).toBe(false);
    expect(wildcardMatch("*", "")).toBe(true);
    expect(wildcardMatch("", "")).toBe(true);
    expect(wildcardMatch("", "a")).toBe(false);
  });
});

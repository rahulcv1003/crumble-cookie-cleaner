import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyImport, exportRules, planCounts, planImport, stripJsonComments, IMPORT_MAX_RULES } from "../../src/core/import-export";
import { createRule, type Rule } from "../../src/core/rules";

let n = 0;
const id = () => `id${++n}`;
const fixture = readFileSync(path.resolve(__dirname, "../fixtures/cad-docs-example.json"), "utf8");

describe("Import and export", () => {
  it("IMP-01 the Cookie AutoDelete documentation example imports into the right lists with cookie-name options", () => {
    const res = planImport(fixture, [], id, 1000);
    if (!res.ok) throw new Error(res.error);
    const { plan } = res;
    expect(plan.skipped).toEqual([]);
    const main = plan.main.map((p) => ({ pattern: p.rule.pattern, list: p.rule.list, cookies: p.rule.cookies }));
    expect(main).toEqual([
      { pattern: "/mozilla/", list: "keep", cookies: { mode: "named", names: ["_gid", "taarId"] } },
      { pattern: "/example.com/", list: "keep", cookies: { mode: "named", names: ["_gid", "taarId"] } },
      { pattern: "github.com", list: "restart", cookies: { mode: "all" } },
      { pattern: "example.com", list: "keep", cookies: { mode: "all" } },
    ]);
    expect(Object.keys(plan.containers)).toEqual(["firefox-container-1"]);
    expect(planCounts(plan, false)).toEqual({ add: 4, replace: 0, skipped: 0, container: 1 });
    // merge: the container's example.com is the same pattern, so it replaces the main one; skip: left out
    expect(applyImport([], plan, false)).toHaveLength(4);
    expect(applyImport([], plan, true)).toHaveLength(4);
  });

  it("IMP-03 a rule that already exists is planned as a replacement and changed only when applied", () => {
    const existing = [createRule("github.com", "keep", id, 1)];
    const res = planImport(fixture, existing, id, 1000);
    if (!res.ok) throw new Error(res.error);
    const gh = res.plan.main.find((p) => p.rule.pattern === "github.com")!;
    expect(gh.replaces).toBe(existing[0]);
    expect(planCounts(res.plan, false)).toMatchObject({ add: 3, replace: 1 });
    expect(existing[0]!.list).toBe("keep"); // nothing changed yet
    const after = applyImport(existing, res.plan, false);
    expect(after.find((r) => r.pattern === "github.com")).toMatchObject({ list: "restart", id: existing[0]!.id });
  });

  it("IMP-04 export then import gives identical rules", () => {
    const rules: Rule[] = [
      createRule("*.github.com", "keep", id, 11),
      { ...createRule("example.com", "restart", id, 22), cookies: { mode: "named", names: ["sid", "lang"] }, note: "Work login" },
      { ...createRule("/google\\.(ca|com)/", "keep", id, 33), siteData: { localStorage: "clean", indexedDB: "keep", cacheStorage: "clean", serviceWorkers: "keep" } },
      createRule("bücher.de", "keep", id, 44),
    ];
    const res = planImport(exportRules(rules), [], id, 99);
    if (!res.ok) throw new Error(res.error);
    expect(applyImport([], res.plan, false)).toEqual(rules);
    // and into the same rules again: every one is a replacement with an identical result
    const again = planImport(exportRules(rules), rules, id, 99);
    if (!again.ok) throw new Error(again.error);
    expect(planCounts(again.plan, false)).toMatchObject({ add: 0, replace: 4 });
    expect(applyImport(rules, again.plan, false)).toEqual(rules);
  });

  it("export is the Cookie AutoDelete format", () => {
    const data = JSON.parse(exportRules([{ ...createRule("a.com", "keep", id, 1), cookies: { mode: "named", names: ["sid"] } }, createRule("b.com", "restart", id, 2)]));
    expect(Object.keys(data)).toEqual(["default"]);
    expect(data.default[0]).toMatchObject({ expression: "a.com", listType: "WHITE", storeId: "default", cookieNames: ["sid"], cleanAllCookies: false });
    expect(data.default[1]).toMatchObject({ expression: "b.com", listType: "GREY", cleanAllCookies: true });
  });

  it("IMP-05 malformed JSON, wrong types, a 2 MB file and 20,000 rules are each rejected; nothing is planned", () => {
    expect(planImport("{ not json", [], id, 0)).toEqual({ ok: false, error: "importErrorNotJson" });
    expect(planImport("[1,2,3]", [], id, 0)).toEqual({ ok: false, error: "importErrorWrongShape" });
    expect(planImport('{"default": "x"}', [], id, 0)).toEqual({ ok: false, error: "importErrorWrongShape" });
    expect(planImport("{}", [], id, 0)).toEqual({ ok: false, error: "importErrorWrongShape" });
    expect(planImport("   ", [], id, 0)).toEqual({ ok: false, error: "importErrorEmpty" });
    const big = JSON.stringify({ default: [{ expression: "a.com", listType: "WHITE", storeId: "default", note: "x".repeat(2 * 1024 * 1024) }] });
    expect(planImport(big, [], id, 0)).toEqual({ ok: false, error: "importErrorTooLarge" });
    const many = JSON.stringify({ default: Array.from({ length: 20_000 }, (_, i) => ({ expression: `s${i}.c`, listType: "WHITE" })) });
    expect(many.length).toBeLessThan(1024 * 1024);
    expect(planImport(many, [], id, 0)).toEqual({ ok: false, error: "importErrorTooManyRules" });
    // comma-splitting counts too
    const splitMany = JSON.stringify({ default: [{ expression: Array.from({ length: IMPORT_MAX_RULES + 1 }, (_, i) => `s${i}.com`).join(","), listType: "WHITE", storeId: "default" }] });
    expect(planImport(splitMany, [], id, 0)).toEqual({ ok: false, error: "importErrorTooManyRules" });
  });

  it("unimportable entries are listed with reasons (wrong list type, IP range, invalid or unsafe regex)", () => {
    const text = JSON.stringify({
      default: [
        { expression: "a.com", listType: "BLACK", storeId: "default" },
        { expression: "192.168.0.0/16", listType: "WHITE", storeId: "default" },
        { expression: "/[a-/", listType: "WHITE", storeId: "default" },
        { expression: "/(a+)+$/", listType: "WHITE", storeId: "default" },
        { expression: 42, listType: "WHITE", storeId: "default" },
        { expression: "ok.com", listType: "WHITE", storeId: "default" },
      ],
    });
    const res = planImport(text, [], id, 0);
    if (!res.ok) throw new Error(res.error);
    expect(res.plan.main.map((p) => p.rule.pattern)).toEqual(["ok.com"]);
    expect(res.plan.skipped.map((s) => s.reason.code)).toEqual([
      "importSkipUnknownList",
      "importSkipIpRange",
      "ruleErrorRegexUnterminatedClass",
      "ruleErrorRegexUnsafe",
      "importSkipNotText",
    ]);
  });

  it("PRV-02 malicious import file: script tags in notes stay plain text; a huge regex is rejected", () => {
    const text = JSON.stringify({
      default: [
        { expression: "evil.com", listType: "WHITE", storeId: "default", crumble: { id: "x1", pattern: "evil.com", list: "keep", cookies: { mode: "all" }, siteData: { localStorage: "keep", indexedDB: "keep", cacheStorage: "keep", serviceWorkers: "keep" }, createdAt: 1, note: "<img src=x onerror=alert(1)><script>alert(1)</script>" } },
        { expression: `/${"a".repeat(5000)}/`, listType: "WHITE", storeId: "default" },
        { expression: "x.com", listType: "WHITE", storeId: "default", crumble: { id: 5, evil: "<script>" } },
      ],
    });
    const res = planImport(text, [], id, 0);
    if (!res.ok) throw new Error(res.error);
    expect(res.plan.main[0]!.rule.note).toBe("<img src=x onerror=alert(1)><script>alert(1)</script>");
    expect(res.plan.skipped.map((s) => s.reason.code)).toEqual(["ruleErrorRegexTooLong"]);
    expect(res.plan.main[1]!.rule).toMatchObject({ pattern: "x.com", list: "keep", cookies: { mode: "all" } }); // invalid extra ignored
  });

  it("stripJsonComments keeps // inside strings", () => {
    expect(JSON.parse(stripJsonComments('{"a": "http://x" // c\n}'))).toEqual({ a: "http://x" });
    expect(JSON.parse(stripJsonComments('{"a": /* c */ 1}'))).toEqual({ a: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { CONFIG } from "../../src/config";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const dist = path.join(root, "dist");
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const manifest = JSON.parse(read(path.join(dist, "manifest.json")));
const messages: Record<string, { message: string }> = JSON.parse(read(path.join(dist, "_locales/en/messages.json")));

describe("Permissions and manifest", () => {
  it("PER-01 built manifest has only the PRD permissions, <all_urls>, and no content scripts", () => {
    expect(manifest.manifest_version).toBe(3);
    expect([...manifest.permissions].sort()).toEqual(
      ["alarms", "browsingData", "contextMenus", "cookies", "notifications", "storage"].sort(),
    );
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
    for (const key of ["content_scripts", "optional_permissions", "optional_host_permissions", "web_accessible_resources", "externally_connectable", "content_security_policy"]) {
      expect(manifest, key).not.toHaveProperty(key);
    }
    for (const forbidden of ["tabs", "history", "webRequest", "scripting", "declarativeNetRequest"]) {
      expect(manifest.permissions).not.toContain(forbidden);
    }
    expect(manifest.minimum_chrome_version).toBe("130");
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    expect(existsSync(path.join(dist, "background.js"))).toBe(true);
    // the shipped build contains no test hooks
    expect(existsSync(path.join(dist, "test-hooks.html"))).toBe(false);
    expect(existsSync(path.join(dist, "test-hooks.js"))).toBe(false);
    expect(statSync(path.join(dist, "fonts/InterVariable.woff2")).size).toBeGreaterThan(1000);
    expect(read(path.join(dist, "fonts/OFL.txt"))).toContain("SIL OPEN FONT LICENSE");
    for (const notice of ["LICENSE", "LICENSE-THIRD-PARTY.md"]) {
      expect(read(path.join(dist, notice))).toBe(read(path.join(root, notice)));
    }
  });

  it("PER-02 build contains no eval, new Function, remote script URLs, fetch or XMLHttpRequest", () => {
    const files = walk(dist).filter((f) => /\.(js|html|mjs)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const forbidden: [string, RegExp][] = [
      ["eval", /\beval\s*\(/],
      ["new Function", /\bnew\s+Function\b/],
      ["Function constructor", /\bFunction\s*\(\s*["'`]/],
      ["string setTimeout", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
      ["fetch", /\bfetch\s*\(/],
      ["XMLHttpRequest", /XMLHttpRequest/],
      ["WebSocket", /\bWebSocket\b/],
      ["sendBeacon", /sendBeacon/],
      ["importScripts", /importScripts\s*\(/],
      ["remote URL", /\b(?:https?|wss?):\/\/(?!\*\/)/i], // match patterns like http://*/* are not addresses
      ["protocol-relative script", /<script[^>]+src\s*=\s*["']\/\//i],
    ];
    // The only URLs allowed are the project links in src/config.ts (changelog, privacy policy,
    // issue form, store page, uninstall form). They are opened only when the user clicks.
    // The SVG namespace is an identifier, never fetched.
    const allowed = [...Object.values(CONFIG).filter((v) => /^https:\/\//.test(v)), "http://www.w3.org/2000/svg"];
    for (const file of files) {
      let text = read(file);
      for (const url of allowed) text = text.split(url).join("");
      for (const [name, re] of forbidden) expect(re.test(text), `${name} in ${path.relative(root, file)}`).toBe(false);
    }
  });

  it("PER-04 user-facing strings come from _locales", () => {
    // Manifest name and description are locale references that resolve.
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extName__");
    expect(manifest.description).toBe("__MSG_extDescription__");
    // Every __MSG_x__ and getMessage("x") used anywhere in the build or source exists in messages.json.
    const sources = [...walk(dist).filter((f) => /\.(js|html|json)$/.test(f) && !f.includes("_locales")), ...walk(path.join(root, "src")).filter((f) => /\.(ts|html)$/.test(f))];
    const used = new Set<string>();
    for (const f of sources) {
      const text = read(f);
      for (const m of text.matchAll(/__MSG_(\w+)__/g)) used.add(m[1]!);
      for (const m of text.matchAll(/getMessage\(\s*["'`](\w+)["'`]/g)) used.add(m[1]!);
    }
    for (const key of used) expect(messages, key).toHaveProperty(key);
    // Every message is non-empty and has no exclamation marks (PRD "Writing in the UI").
    for (const [key, entry] of Object.entries(messages)) {
      expect(entry.message.trim(), key).not.toBe("");
      expect(entry.message, key).not.toMatch(/!/);
      // The importer may name the original's lists when describing its files (PRD "Writing in the UI").
      if (!/^(import|setupStep2)/.test(key)) expect(entry.message.toLowerCase(), key).not.toMatch(/whitelist|greylist|graylist/);
    }
    // UI pages (built in Phase C) must not carry literal text: any HTML under src/ui has no text nodes.
    const uiDir = path.join(root, "src/ui");
    const htmlFiles = existsSync(uiDir) ? walk(uiDir).filter((f) => f.endsWith(".html")) : [];
    for (const f of htmlFiles) {
      const body = read(f).replace(/<(script|style|title)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      expect(body, f).toBe("");
    }
  });

  it("STO-01 (early check) name and short description fit the store limits", () => {
    expect(messages.extName!.message.length).toBeLessThanOrEqual(75);
    expect(messages.extDescription!.message.length).toBeLessThanOrEqual(132);
  });

  it("service worker bundle is within the 220 KB budget (PRF-02 early check)", () => {
    expect(statSync(path.join(dist, "background.js")).size).toBeLessThan(220 * 1024);
  });
});

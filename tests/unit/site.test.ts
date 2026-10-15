import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const out = path.join(root, "dist-site");
let pages: { name: string; html: string }[] = [];

beforeAll(() => {
  execFileSync(process.execPath, [path.join(root, "scripts/site.mjs")]);
  pages = readdirSync(out).filter((f) => f.endsWith(".html")).map((name) => ({ name, html: readFileSync(path.join(out, name), "utf8") }));
});

const attr = (html: string, re: RegExp) => html.match(re)?.[1];
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON-LD is untyped */
describe("Store and landing site (automated parts of STO-04/05/06)", () => {
  it("every page has a unique title under 60 characters and description under 155", () => {
    const titles = pages.map((p) => decode(attr(p.html, /<title>([^<]+)<\/title>/)!));
    const descs = pages.map((p) => decode(attr(p.html, /<meta name="description" content="([^"]+)"/)!));
    for (const t of titles) expect(t.length, t).toBeLessThan(60);
    for (const d of descs) expect(d.length, d).toBeLessThan(155);
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descs).size).toBe(pages.length);
  });

  it("every page has one h1, a canonical link, Open Graph and Twitter card tags with a 1200 x 630 image", () => {
    for (const { name, html } of pages) {
      expect(html.match(/<h1[\s>]/g)?.length, name).toBe(1);
      expect(html, name).toMatch(/<link rel="canonical" href="https:\/\/[^"]+">/);
      for (const tag of ["og:title", "og:description", "og:url", "og:image"]) expect(html, `${name} ${tag}`).toContain(`property="${tag}"`);
      expect(html).toContain('content="1200"');
      expect(html).toContain('content="630"');
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
    }
  });

  it("JSON-LD: SoftwareApplication on the home page, FAQPage on pages with an FAQ, both valid JSON with the required fields", () => {
    const blocks = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    const home = blocks(pages.find((p) => p.name === "index.html")!.html)[0]["@graph"];
    const app = home.find((x: any) => x["@type"] === "SoftwareApplication");
    expect(app).toMatchObject({ applicationCategory: "BrowserApplication", operatingSystem: "Chrome, Edge, Brave, Vivaldi", offers: { price: "0" } });
    for (const p of pages.filter((x) => x.html.includes('class="faq"'))) {
      const faq = blocks(p.html)[0]["@graph"].find((x: any) => x["@type"] === "FAQPage");
      expect(faq.mainEntity.length, p.name).toBe(7);
      for (const q of faq.mainEntity) expect(q.acceptedAnswer.text.length).toBeGreaterThan(40);
    }
  });

  it("images are WebP/AVIF (except the share image) with width, height and alt; no scripts, trackers or cookies", () => {
    for (const { name, html } of pages) {
      for (const img of html.match(/<img [^>]+>/g) ?? []) {
        expect(img, name).toMatch(/src="[^"]+\.(webp|avif)"/);
        expect(img, name).toMatch(/ width="\d+"/);
        expect(img, name).toMatch(/ height="\d+"/);
        expect(img, name).toMatch(/ alt="[^"]{20,}"/);
      }
      expect(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), name).not.toMatch(/<script|document\.cookie|google-analytics|googletagmanager|gtag\(|plausible|<iframe/i);
    }
  });

  it("robots.txt and sitemap.xml exist and list the indexable pages", () => {
    expect(readFileSync(path.join(out, "robots.txt"), "utf8")).toMatch(/Sitemap: https:\/\/.+sitemap\.xml/);
    const sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");
    for (const p of ["what-happened-to-cookie-autodelete.html", "privacy.html", "permissions.html", "changelog.html"]) expect(sitemap).toContain(p);
    expect(sitemap).not.toContain("uninstall.html");
  });

  it("the FAQ answers the seven questions from the PRD", () => {
    const home = pages.find((p) => p.name === "index.html")!.html;
    for (const q of ["Is there a Cookie AutoDelete for Chrome now?", "How do I move my Cookie AutoDelete whitelist?", "Does it delete partitioned (CHIPS) cookies?", "Will it log me out of everything?", "Why does it need access to all websites?", "Does it work on Edge, Brave and Vivaldi?", "What&#39;s the difference between Keep and Keep until restart?".replace("&#39;", "'")]) {
      expect(decode(home)).toContain(q);
    }
  });
});

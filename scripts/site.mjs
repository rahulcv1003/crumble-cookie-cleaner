// Builds the landing site (site/*.page.html + _layout.html) into dist-site/ for GitHub Pages.
// Placeholders come from src/config.ts values (BASE URL, GitHub user and repo, store ids).
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "site");
const out = path.join(root, "dist-site");
const config = await readFile(path.join(root, "src/config.ts"), "utf8");
const get = (key) => config.match(new RegExp(`${key}: "([^"]*)"`))[1];
const GITHUB_USER = get("githubUser");
const REPO = get("repoName");
// SITE_BASE overrides the address (used to audit the built site locally before the repository exists).
const BASE = process.env.SITE_BASE ?? `https://${GITHUB_USER}.github.io/${REPO}/`;
const vars = { BASE, GITHUB_USER, REPO, EXTENSION_ID: "<extension-id>", EDGE_ID: "<edge-extension-id>", POPUP_H: "" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const faq = JSON.parse(await readFile(path.join(src, "faq.json"), "utf8"));
const faqHtml = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n");
const faqLd = { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
const appLd = {
  "@type": "SoftwareApplication",
  name: "Crumble: Auto-Delete Cookies on Tab Close",
  applicationCategory: "BrowserApplication",
  operatingSystem: "Chrome, Edge, Brave, Vivaldi",
  description: "Deletes cookies and site data when you close a tab. Keep the sites you trust. Imports your Cookie AutoDelete lists.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: BASE,
};
const ld = (items) => (items.length ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": items })}</script>` : "");

let popupH = "";
try {
  const buf = await readFile(path.join(src, "popup.webp"));
  // VP8 / VP8L / VP8X header: read the canvas size for the img height attribute.
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8 ") popupH = String(buf.readUInt16LE(28) & 0x3fff);
  else if (fourcc === "VP8L") popupH = String((((buf[24] | (buf[25] << 8) | (buf[26] << 16) | (buf[27] << 24)) >> 14) & 0x3fff) + 1);
  else if (fourcc === "VP8X") popupH = String(1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)));
} catch {
  // no popup image yet: the attribute is left empty
}
vars.POPUP_H = popupH;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const layout = await readFile(path.join(src, "_layout.html"), "utf8");
const fill = (text) => text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
const pages = [];
for (const file of (await readdir(src)).filter((f) => f.endsWith(".page.html"))) {
  const raw = await readFile(path.join(src, file), "utf8");
  const [head, content] = raw.split("\n---\n");
  const meta = Object.fromEntries(head.split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
  const json = meta.jsonld === "index" ? ld([appLd, faqLd]) : meta.jsonld === "faq" ? ld([faqLd]) : "";
  const html = fill(layout.replace("{{CONTENT}}", content.replace("{{FAQ}}", faqHtml)).replace("{{JSONLD}}", json))
    .replace("{{TITLE}}", esc(meta.title)).replace("{{TITLE}}", esc(meta.title)).replace("{{TITLE}}", esc(meta.title))
    .replace(/\{\{DESCRIPTION\}\}/g, esc(meta.description)).replace(/\{\{PATH\}\}/g, meta.path);
  const name = meta.path || "index.html";
  const finalHtml = name === "uninstall.html" ? html.replace("<link rel=\"canonical\"", "<meta name=\"robots\" content=\"noindex\">\n<link rel=\"canonical\"") : html;
  await writeFile(path.join(out, name), finalHtml);
  pages.push(meta.path);
}
for (const f of ["site.css", "icon.svg", "og.png", "popup.webp"]) await cp(path.join(src, f), path.join(out, f));
await writeFile(path.join(out, "robots.txt"), fill(await readFile(path.join(src, "robots.txt"), "utf8")));
const urls = pages.filter((p) => p !== "uninstall.html").map((p) => `  <url><loc>${BASE}${p}</loc><lastmod>2026-10-15</lastmod></url>`).join("\n");
await writeFile(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
await writeFile(path.join(out, ".nojekyll"), "");
console.log(`Site built into dist-site/ (${pages.length} pages)`);

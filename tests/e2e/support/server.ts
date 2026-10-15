/**
 * Local HTTPS test sites for E2E (PRD "Test environment"), started by global-setup.ts.
 * Hostnames are mapped to 127.0.0.1 by the browser's --host-resolver-rules flag.
 * Port 443 by default so origins carry no port number (override with CRUMBLE_TEST_PORT).
 *
 *   a.test, b.test   first-party cookie, LocalStorage, IndexedDB, Cache Storage, Service Worker
 *                    (b.test also embeds widget.test; a.test also loads a tracker.test image)
 *   widget.test      /widget: partitioned + unpartitioned cookie, LocalStorage, IndexedDB (when embedded)
 *   tracker.test     /pixel.png sets a third-party unpartitioned cookie
 *   app.test, sso.test  mock login: app.test/login -> sso.test/auth -> app.test/callback (session cookie)
 *
 * Cookies carry Max-Age=86400 so they survive a browser restart, like real logins.
 * Every site also has /blank (read-only page with readBack()), and b.test/ro embeds a read-only widget.
 */
import https from "node:https";
import type { ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const CERT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const READ_BACK = `window.readBack = async () => ({
  cookie: document.cookie,
  localStorage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  indexedDB: (await indexedDB.databases()).map((d) => d.name),
  caches: self.caches ? await caches.keys() : [],
  serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [],
});`;

function writeAll(name: string): string {
  return `
  localStorage.setItem('${name}', '1');
  window.setupDone = (async () => {
    await new Promise((r) => { const q = indexedDB.open('${name}db', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { q.result.close(); r(); }; q.onerror = () => r(); });
    const c = await caches.open('${name}cache'); await c.put('/cached', new Response('cached'));
    await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    return true;
  })();`;
}

type Res = ServerResponse;
function html(res: Res, body: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(`<!doctype html><meta charset="utf-8">${body}`);
}
function redirect(res: Res, location: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}

/** Requests served per route, for tests that check how often a page loaded (for example a reload). */
export const hits = new Map<string, number>();

export function createTestServer(): https.Server {
  return https.createServer(
    { key: fs.readFileSync(path.join(CERT_DIR, "key.pem")), cert: fs.readFileSync(path.join(CERT_DIR, "cert.pem")) },
    (req, res) => {
      const host = (req.headers.host ?? "").split(":")[0];
      const url = new URL(req.url ?? "/", `https://${host}`);
      const route = `${host}${url.pathname}`;
      if (route === "app.test/__hits") {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(Object.fromEntries(hits)));
      }
      hits.set(route, (hits.get(route) ?? 0) + 1);

      if (url.pathname === "/blank") return html(res, `<p>${host} (read only)</p><script>${READ_BACK}</script>`);
      if (url.pathname === "/sw.js" && (host === "a.test" || host === "b.test")) {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        return res.end("self.addEventListener('fetch', () => {});");
      }
      switch (route) {
        case "a.test/":
          return html(res, `<h1>a.test</h1><img src="https://tracker.test/pixel.png" alt=""><script>${writeAll("a")}${READ_BACK}</script>`, {
            "Set-Cookie": "first=1; Secure; SameSite=Lax; Path=/; Max-Age=86400",
          });
        case "b.test/":
          return html(res, `<h1>b.test</h1><iframe id="w" src="https://widget.test/widget" width="300" height="100"></iframe><script>${writeAll("b")}${READ_BACK}</script>`, {
            "Set-Cookie": "first=1; Secure; SameSite=Lax; Path=/; Max-Age=86400",
          });
        case "b.test/ro":
          return html(res, `<h1>b.test (read-only embed)</h1><iframe id="w" src="https://widget.test/widget-ro" width="300" height="100"></iframe>`);
        case "widget.test/widget":
          return html(res, `<p>widget</p><script>
            localStorage.setItem('w', '1');
            window.idbDone = new Promise((r) => { const q = indexedDB.open('wdb', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { q.result.close(); r(true); }; q.onerror = () => r(false); });
            ${READ_BACK}</script>`, {
            "Set-Cookie": ["part=1; Secure; SameSite=None; Partitioned; Path=/; Max-Age=86400", "plain=1; Secure; SameSite=None; Path=/; Max-Age=86400"],
          });
        case "widget.test/widget-ro":
          return html(res, `<p>widget (read only)</p><script>${READ_BACK}</script>`);
        case "widget.test/":
          return html(res, `<h1>widget.test</h1><script>${READ_BACK}</script>`);
        case "tracker.test/pixel.png":
          res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "Set-Cookie": "trk=1; Secure; SameSite=None; Path=/; Max-Age=86400" });
          return res.end(PNG);
        case "app.test/": {
          const loggedIn = /(?:^|;\s*)session=/.test(req.headers.cookie ?? "");
          return html(res, `<h1 id="state">${loggedIn ? "Logged in" : "Logged out"}</h1><a id="login" href="/login">Log in</a><script>${READ_BACK}</script>`);
        }
        case "app.test/login":
          return redirect(res, `https://sso.test/auth?return=${encodeURIComponent("https://app.test/callback")}`);
        case "sso.test/auth": {
          const ret = url.searchParams.get("return") ?? "";
          if (!ret.startsWith("https://app.test/")) { res.writeHead(400); return res.end("bad return"); }
          return redirect(res, `${ret}?code=ok`, { "Set-Cookie": "sso=1; Secure; SameSite=Lax; Path=/; Max-Age=86400" });
        }
        case "app.test/callback":
          if (url.searchParams.get("code") !== "ok") { res.writeHead(400); return res.end("bad code"); }
          return redirect(res, "/", { "Set-Cookie": "session=abc123; Secure; SameSite=Lax; Path=/; HttpOnly; Max-Age=86400" });
        default:
          res.writeHead(404, { "Content-Type": "text/plain" });
          return res.end("not found");
      }
    },
  );
}

export async function startTestServer(port = Number(process.env.CRUMBLE_TEST_PORT ?? 443)): Promise<https.Server> {
  const server = createTestServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  process.env.CRUMBLE_TEST_PORT = String(addr.port);
  return server;
}

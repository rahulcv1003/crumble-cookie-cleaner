// Local HTTPS test server for the spikes. Routes by Host header.
const https = require('https'), fs = require('fs'), path = require('path');
const PORT = Number(process.env.PORT || 443);
const opts = { key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')), cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem')) };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const html = (res, body, headers = {}) => { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', ...headers }); res.end('<!doctype html><meta charset=utf-8>' + body); };
const log = [];
https.createServer(opts, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, 'https://' + host);
  log.push(host + url.pathname);
  if (host === 'b.test' && url.pathname === '/') return html(res, '<h1>b.test</h1><iframe id=w src="https://widget.test/widget" width=300 height=100></iframe>');
  if (host === 'widget.test' && url.pathname === '/widget') {
    return html(res, `<p>widget</p><script>
      localStorage.setItem('w','1');
      window.idbDone = new Promise(r => { const q = indexedDB.open('wdb', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { q.result.close(); r(true); }; q.onerror = () => r(false); });
      window.readBack = async () => ({ ls_w: localStorage.getItem('w'), idb: (await indexedDB.databases()).map(d => d.name), cookie: document.cookie });
      </script>`, { 'Set-Cookie': ['part=1; Secure; SameSite=None; Partitioned; Path=/', 'plain=1; Secure; SameSite=None; Path=/'] });
  }
  if (host === 'widget.test' && url.pathname === '/') return html(res, `<h1>widget.test direct</h1><script>window.readBack = async () => ({ ls_direct: localStorage.getItem('direct'), ls_w: localStorage.getItem('w'), idb: (await indexedDB.databases()).map(d => d.name), cookie: document.cookie });</script>`);
  if (host === 'a.test' && url.pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("self.addEventListener('fetch', () => {});"); }
  if (host === 'a.test' && url.pathname === '/') {
    return html(res, `<h1>a.test</h1><img src="https://tracker.test/pixel.png"><script>
      localStorage.setItem('a','1');
      window.setupDone = (async () => {
        await new Promise(r => { const q = indexedDB.open('adb', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { q.result.close(); r(); }; });
        const c = await caches.open('acache'); await c.put('/cached', new Response('hello'));
        const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
        return true; })();
      window.readBack = async () => ({ ls_a: localStorage.getItem('a'), idb: (await indexedDB.databases()).map(d => d.name), caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope), cookie: document.cookie });
      </script>`, { 'Set-Cookie': 'first=1; Secure; SameSite=Lax; Path=/' });
  }
  if (host === 'a.test' && url.pathname === '/blank') return html(res, `<p>a.test blank (no writes)</p><script>window.readBack = async () => ({ ls_a: localStorage.getItem('a'), idb: (await indexedDB.databases()).map(d => d.name), caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope), cookie: document.cookie });</script>`);
  if (host === 'b.test' && url.pathname === '/ro') return html(res, '<h1>b.test (read-only embed)</h1><iframe id=w src="https://widget.test/widget-ro" width=300 height=100></iframe>');
  if (host === 'widget.test' && url.pathname === '/widget-ro') return html(res, `<p>widget read-only</p><script>window.readBack = async () => ({ ls_w: localStorage.getItem('w'), idb: (await indexedDB.databases()).map(d => d.name), cookie: document.cookie });</script>`);
  if (host === 'b.test' && url.pathname === '/blank') return html(res, '<p>b.test blank</p>');
  if (host === 'tracker.test' && url.pathname === '/pixel.png') { res.writeHead(200, { 'Content-Type': 'image/png', 'Set-Cookie': 'trk=1; Secure; SameSite=None; Path=/', 'Cache-Control': 'no-store' }); return res.end(PNG); }
  res.writeHead(404); res.end('not found');
}).listen(PORT, () => console.log('spike server on', PORT));

// Variants for 4c/4d: (B) close 8 s after scheduling; (C) relaunch without --load-extension to see if the extension persists in the profile.
const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const iso = t => t ? new Date(t).toISOString() : null;
(async () => {
  const out = {};
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's4v-'));
  let { ctx, call, extId } = await launch(dir);
  const prep = await call('prepareRestartTest');
  await sleep(8000);
  out.B_before_close = await call('readState');
  await ctx.close(); const closedAt = Date.now();
  out.B_closedSecondsAfterPrepare = (closedAt - prep.t) / 1000;
  // inspect the profile's stored extension location
  try { const sp = JSON.parse(fs.readFileSync(path.join(dir, 'Default', 'Secure Preferences'), 'utf8')); const e = sp.extensions && sp.extensions.settings && sp.extensions.settings[extId]; out.B_securePrefsExtEntry = e ? { location: e.location, state: e.state, path: e.path, from_webstore: e.from_webstore } : 'not found'; } catch (e) { out.B_securePrefsExtEntry = 'read error ' + e.message; }
  try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'Default', 'Preferences'), 'utf8')); const e = p.extensions && p.extensions.settings && p.extensions.settings[extId]; out.B_prefsExtEntry = e ? { location: e.location, alarms: e.alarms, state: e.state } : 'not found'; } catch (e) { out.B_prefsExtEntry = 'read error ' + e.message; }
  await sleep(10000);
  ({ ctx, call } = await launch(dir));
  const s1 = await call('readState');
  out.B_after_relaunch = { secondsAfterPrepare: (Date.now() - prep.t) / 1000, sessionVal: s1.session.sessionVal ?? null, localVal: s1.local.localVal ?? null, alarms: s1.alarms, onStartupFiredAt: iso(s1.local.onStartupFiredAt), installEvents: (s1.local.installEvents || []).map(e => ({ ...e, at: iso(e.at) })) };
  await sleep(Math.max(0, prep.t + 75000 - Date.now()));
  const s2 = await call('readState');
  out.B_after_due = { alarmFired: iso(s2.local.alarmFired_restarttest), alarms: s2.alarms };
  await ctx.close();
  // Variant C: relaunch WITHOUT --load-extension
  await sleep(2000);
  const { chromium } = require('playwright');
  const r = await launchNoExt(dir);
  out.C_relaunch_without_load_extension = r;
  fs.writeFileSync('results/spike4_variants.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
async function launchNoExt(dir) {
  const { chromium } = require('playwright'); const { ourDisableFeaturesArg } = require('./lib');
  const ctx = await chromium.launchPersistentContext(dir, { headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: ['--host-resolver-rules=MAP *.test 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server', ourDisableFeaturesArg()] });
  await sleep(4000);
  const sws = ctx.serviceWorkers().map(w => w.url());
  const p = await ctx.newPage(); await p.goto('chrome://extensions'); await sleep(1500);
  const names = await p.evaluate(() => { const m = document.querySelector('extensions-manager'); const list = m && m.shadowRoot.querySelector('extensions-item-list'); return list ? [...list.shadowRoot.querySelectorAll('extensions-item')].map(i => i.shadowRoot.querySelector('#name')?.textContent.trim()) : 'no list'; });
  await ctx.close();
  return { serviceWorkers: sws, extensionsPageItems: names };
}

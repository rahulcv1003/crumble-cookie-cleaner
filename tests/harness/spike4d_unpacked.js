// 4c/4d with the extension persisted as an UNPACKED install (location 4) in the test profile, relaunching WITHOUT --load-extension.
const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const iso = t => t ? new Date(t).toISOString() : null;
function patchToUnpacked(dir, extId) {
  const p = path.join(dir, 'Default', 'Preferences'); const prefs = JSON.parse(fs.readFileSync(p, 'utf8'));
  const e = prefs.extensions.settings[extId]; const before = e.location; e.location = 4;
  prefs.extensions.ui = { ...(prefs.extensions.ui || {}), developer_mode: true };
  fs.writeFileSync(p, JSON.stringify(prefs)); return { before, after: 4, keys: Object.keys(e) };
}
(async () => {
  const out = {};
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's4u-'));
  let { ctx, call, extId } = await launch(dir); await sleep(1000); await ctx.close();
  out.patch = patchToUnpacked(dir, extId);
  // launch 2: no --load-extension; extension should load from profile
  ({ ctx, call } = await launch(dir, { loadExt: false }));
  out.launch2_state = await call('readState');
  const prep = await call('prepareRestartTest');
  out.c_prepared = { tIso: iso(prep.t), alarm: prep.alarm, state: await call('readState') };
  await sleep(5000);
  await ctx.close(); out.c_closedSecondsAfterPrepare = (Date.now() - prep.t) / 1000;
  await sleep(10000);
  ({ ctx, call } = await launch(dir, { loadExt: false }));
  const s1 = await call('readState');
  out.d_after_relaunch = { secondsAfterPrepare: (Date.now() - prep.t) / 1000, sessionVal: s1.session.sessionVal ?? null, localVal: s1.local.localVal ?? null, alarms: s1.alarms, onStartupFiredAt: iso(s1.local.onStartupFiredAt), onStartupSecondsAfterPrepare: s1.local.onStartupFiredAt ? (s1.local.onStartupFiredAt - prep.t) / 1000 : null, installEvents: (s1.local.installEvents || []).map(e => ({ ...e, at: iso(e.at) })), swBoots: (s1.local.swBoots || []).map(iso) };
  await sleep(Math.max(0, prep.t + 75000 - Date.now()));
  const s2 = await call('readState');
  out.d_after_due = { alarmFired: iso(s2.local.alarmFired_restarttest), firedSecondsAfterPrepare: s2.local.alarmFired_restarttest ? (s2.local.alarmFired_restarttest - prep.t) / 1000 : null, alarms: s2.alarms };
  await ctx.close();
  fs.writeFileSync('results/spike4_unpacked.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

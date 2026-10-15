// Extra: alarm that becomes due while the browser is closed (persisted unpacked install).
const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const iso = t => t ? new Date(t).toISOString() : null;
(async () => {
  const out = {};
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's4m-'));
  let { ctx, call, extId } = await launch(dir); await sleep(1000); await ctx.close();
  const p = path.join(dir, 'Default', 'Preferences'); const prefs = JSON.parse(fs.readFileSync(p, 'utf8'));
  prefs.extensions.settings[extId].location = 4; prefs.extensions.ui = { developer_mode: true }; fs.writeFileSync(p, JSON.stringify(prefs));
  ({ ctx, call } = await launch(dir, { loadExt: false }));
  const a = await call('createAlarm', { name: 'missed', delayMs: 20000 });
  out.created = { tIso: iso(a.t), alarm: a.alarm };
  await sleep(3000); await ctx.close(); out.closedSecondsAfterCreate = (Date.now() - a.t) / 1000;
  await sleep(30000);
  ({ ctx, call } = await launch(dir, { loadExt: false }));
  const relaunchedAt = Date.now(); await sleep(3000);
  const s = await call('readState');
  out.after_relaunch = { relaunchedSecondsAfterCreate: (relaunchedAt - a.t) / 1000, alarmFiredAt: iso(s.local.alarmFired_missed), firedSecondsAfterCreate: s.local.alarmFired_missed ? (s.local.alarmFired_missed - a.t) / 1000 : null, onStartupFiredAt: iso(s.local.onStartupFiredAt), alarms: s.alarms };
  await ctx.close();
  fs.writeFileSync('results/spike4_missed.json', JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

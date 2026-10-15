const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const iso = t => t ? new Date(t).toISOString() : null;
async function stopExtensionSW(ctx, runner, extId) {
  const cdp = await ctx.newCDPSession(runner);
  const versions = new Map(); const statusLog = [];
  cdp.on('ServiceWorker.workerVersionUpdated', e => { for (const v of e.versions) { versions.set(v.versionId, v); statusLog.push({ t: Date.now(), versionId: v.versionId, scriptURL: v.scriptURL, runningStatus: v.runningStatus, status: v.status }); } });
  await cdp.send('ServiceWorker.enable'); await sleep(500);
  const ext = [...versions.values()].filter(v => v.scriptURL.startsWith(`chrome-extension://${extId}/`) && v.runningStatus === 'running');
  const res = { method: 'CDP ServiceWorker.stopWorker via page session on extension page', found: ext.map(v => ({ versionId: v.versionId, runningStatus: v.runningStatus })) };
  for (const v of ext) await cdp.send('ServiceWorker.stopWorker', { versionId: v.versionId });
  await sleep(1500);
  res.statusLog = statusLog;
  res.latest = [...versions.values()].filter(v => v.scriptURL.startsWith(`chrome-extension://${extId}/`)).map(v => ({ versionId: v.versionId, runningStatus: v.runningStatus }));
  return { res, cdp, versions, statusLog };
}
(async () => {
  const out = {};
  // ---- 4a/4b ----
  {
    const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's4b-'));
    const { ctx, call, runner, extId } = await launch(dir);
    const sch = await call('scheduleSleepTest');
    out.a_scheduled = { ...sch, scheduledAtIso: iso(sch.scheduledAt) };
    await sleep(5000);
    const { res, statusLog } = await stopExtensionSW(ctx, runner, extId);
    out.b_stop = { stoppedAt: Date.now(), stoppedAtIso: iso(Date.now()), ...res };
    await sleep(70000);
    out.b_statusLogDuringWait = statusLog.filter(s => s.t > out.b_stop.stoppedAt).map(s => ({ ...s, t: iso(s.t) }));
    const st = await call('readState');
    const L = st.local;
    out.b_result = {
      timeoutFiredAt: iso(L.timeoutFiredAt), alarmFiredAt: iso(L.alarmFired_sleeptest),
      alarmDelayFromScheduleMs: L.alarmFired_sleeptest ? L.alarmFired_sleeptest - sch.scheduledAt : null,
      timeoutDelayFromScheduleMs: L.timeoutFiredAt ? L.timeoutFiredAt - sch.scheduledAt : null,
      swBoots: (L.swBoots || []).map(iso), alarmsNow: st.alarms,
    };
    await ctx.close();
  }
  // ---- 4c/4d ----
  {
    const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's4d-'));
    let { ctx, call } = await launch(dir);
    const prep = await call('prepareRestartTest');
    out.c_prepared = { ...prep, tIso: iso(prep.t), stateBeforeClose: await call('readState') };
    const closeStart = Date.now(); await ctx.close(); const closedAt = Date.now();
    out.c_closed = { closedAtIso: iso(closedAt), secondsAfterPrepare: (closedAt - prep.t) / 1000 };
    await sleep(10000);
    ({ ctx, call } = await launch(dir));
    const relaunchedAt = Date.now();
    const s1 = await call('readState');
    out.d_immediately_after_relaunch = { relaunchedAtIso: iso(relaunchedAt), secondsAfterPrepare: (relaunchedAt - prep.t) / 1000,
      sessionVal: s1.session.sessionVal ?? null, localVal: s1.local.localVal ?? null, alarms: s1.alarms,
      onStartupFiredAt: iso(s1.local.onStartupFiredAt), installEvents: (s1.local.installEvents || []).map(e => ({ ...e, at: iso(e.at) })), swBoots: (s1.local.swBoots || []).map(iso),
      alarmFired_restarttest: iso(s1.local.alarmFired_restarttest) };
    const waitMs = Math.max(0, prep.t + 75000 - Date.now()); await sleep(waitMs);
    const s2 = await call('readState');
    out.d_after_alarm_due = { readAtIso: iso(Date.now()), secondsAfterPrepare: (Date.now() - prep.t) / 1000, alarmFired_restarttest: iso(s2.local.alarmFired_restarttest),
      firedSecondsAfterPrepare: s2.local.alarmFired_restarttest ? (s2.local.alarmFired_restarttest - prep.t) / 1000 : null, alarms: s2.alarms, sessionVal: s2.session.sessionVal ?? null };
    await ctx.close();
  }
  fs.writeFileSync('results/spike4.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

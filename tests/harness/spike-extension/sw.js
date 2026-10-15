// Throwaway spike service worker. All listeners registered synchronously at top level.
const now = () => Date.now();
chrome.runtime.onStartup.addListener(() => { chrome.storage.local.set({ onStartupFiredAt: now() }); });
chrome.runtime.onInstalled.addListener((d) => { chrome.storage.local.get('installEvents').then(r => chrome.storage.local.set({ installEvents: [...(r.installEvents || []), { reason: d.reason, at: now() }] })); });
chrome.alarms.onAlarm.addListener((a) => { chrome.storage.local.set({ ['alarmFired_' + a.name]: now() }); });
// record every worker boot
chrome.storage.local.get('swBoots').then(r => chrome.storage.local.set({ swBoots: [...(r.swBoots || []), now()] }));

const handlers = {
  ping: async () => ({ pong: now() }),
  hasPublicSuffix: async () => {
    const ps = chrome.publicSuffix;
    return { typeof: typeof ps, keys: ps ? Object.keys(ps) : null, protoKeys: ps ? Object.getOwnPropertyNames(Object.getPrototypeOf(ps) || {}) : null };
  },
  cookiesGetAll: async (details) => chrome.cookies.getAll(details),
  cookiesRemove: async (details) => { try { return { result: await chrome.cookies.remove(details) }; } catch (e) { return { error: String(e) }; } },
  cookiesSet: async (details) => { try { return { result: await chrome.cookies.set(details) }; } catch (e) { return { error: String(e), lastError: chrome.runtime.lastError && chrome.runtime.lastError.message }; } },
  getAllCookieStores: async () => chrome.cookies.getAllCookieStores(),
  browsingDataRemove: async ({ options, types }) => { const t0 = now(); try { await chrome.browsingData.remove(options, types); return { ok: true, ms: now() - t0 }; } catch (e) { return { error: String(e) }; } },
  tabsQuery: async () => (await chrome.tabs.query({})).map(t => ({ id: t.id, url: t.url, pendingUrl: t.pendingUrl, title: t.title, hasUrlKey: 'url' in t, hasTitleKey: 'title' in t })),
  scheduleSleepTest: async () => {
    await chrome.storage.local.remove(['timeoutFiredAt', 'alarmFired_sleeptest']);
    const scheduledAt = now();
    setTimeout(() => { chrome.storage.local.set({ timeoutFiredAt: now() }); }, 15000);
    await chrome.alarms.create('sleeptest', { when: scheduledAt + 60000 });
    await chrome.storage.local.set({ sleepScheduledAt: scheduledAt });
    return { scheduledAt, alarm: await chrome.alarms.get('sleeptest') };
  },
  prepareRestartTest: async () => {
    const t = now();
    await chrome.storage.session.set({ sessionVal: 'S-' + t });
    await chrome.storage.local.set({ localVal: 'L-' + t });
    await chrome.storage.local.remove(['alarmFired_restarttest', 'onStartupFiredAt']);
    await chrome.alarms.create('restarttest', { when: t + 60000 });
    return { t, alarm: await chrome.alarms.get('restarttest') };
  },
  createAlarm: async ({ name, delayMs }) => { const t = now(); await chrome.alarms.create(name, { when: t + delayMs }); return { t, alarm: await chrome.alarms.get(name) }; },
  readState: async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null), alarms: await chrome.alarms.getAll() }),
  seedCookies: async ({ hosts, perHost, tmpl = 'https://h{h}.seed.test/' }) => {
    const t0 = performance.now(); let ok = 0, fail = 0; const jobs = [];
    for (let h = 0; h < hosts; h++) for (let i = 0; i < perHost; i++) jobs.push({ url: tmpl.replace('{h}', h), name: 'c' + i, value: 'v' + i, secure: true, sameSite: 'no_restriction', expirationDate: Math.floor(now() / 1000) + 3600 });
    for (let i = 0; i < jobs.length; i += 100) {
      const r = await Promise.all(jobs.slice(i, i + 100).map(j => chrome.cookies.set(j).then(c => c ? 1 : 0, () => 0)));
      r.forEach(x => x ? ok++ : fail++);
    }
    const existing = (await chrome.cookies.getAll({ partitionKey: {} })).length;
    return { ok, fail, ms: Math.round(performance.now() - t0), existingAfterSeed: existing };
  },
  timeGetAllAndRemove: async ({ suffix, re }) => {
    const match = re ? (d => new RegExp(re).test(d)) : (d => d.endsWith(suffix));
    const t0 = performance.now();
    const all = await chrome.cookies.getAll({ partitionKey: {} });
    const t1 = performance.now();
    const targets = all.filter(c => match(c.domain));
    let removed = 0, nulls = 0, errors = 0;
    for (let i = 0; i < targets.length; i += 100) {
      const r = await Promise.all(targets.slice(i, i + 100).map(c => {
        const d = { url: `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, name: c.name, storeId: c.storeId };
        if (c.partitionKey) d.partitionKey = c.partitionKey;
        return chrome.cookies.remove(d).then(x => x ? 'ok' : 'null', () => 'err');
      }));
      r.forEach(x => x === 'ok' ? removed++ : x === 'null' ? nulls++ : errors++);
    }
    const t2 = performance.now();
    const after = (await chrome.cookies.getAll({ partitionKey: {} })).filter(c => match(c.domain)).length;
    return { totalCookiesRead: all.length, targetCount: targets.length, getAllMs: +(t1 - t0).toFixed(1), removeMs: +(t2 - t1).toFixed(1), removed, nulls, errors, remainingAfter: after };
  },
};
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg && msg.cmd];
  if (!h) { sendResponse({ error: 'unknown cmd ' + (msg && msg.cmd) }); return; }
  Promise.resolve().then(() => h(msg.args)).then(r => sendResponse({ ok: true, data: r }), e => sendResponse({ error: String(e && e.stack || e) }));
  return true;
});

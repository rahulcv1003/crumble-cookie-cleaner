const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
(async () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's2-'));
  const { ctx, call } = await launch(dir); const out = {};
  const readEmbedded = async () => { const p = await ctx.newPage(); await p.goto('https://b.test/ro', { waitUntil: 'load' }); const f = p.frames().find(f => f.url().startsWith('https://widget.test/')); const r = await f.evaluate(() => window.readBack()); await p.close(); return r; };
  const readDirect = async () => { const p = await ctx.newPage(); await p.goto('https://widget.test/', { waitUntil: 'load' }); const r = await p.evaluate(() => window.readBack()); await p.close(); return r; };
  const readA = async () => { const p = await ctx.newPage(); await p.goto('https://a.test/blank', { waitUntil: 'load' }); const r = await p.evaluate(() => window.readBack()); await p.close(); return r; };
  // a
  const b = await ctx.newPage(); await b.goto('https://b.test/', { waitUntil: 'load' });
  const wf = b.frames().find(f => f.url().startsWith('https://widget.test/')); await wf.evaluate(() => window.idbDone);
  out.a_embedded_after_write = await wf.evaluate(() => window.readBack());
  // b
  const w = await ctx.newPage(); await w.goto('https://widget.test/', { waitUntil: 'load' });
  await w.evaluate(() => localStorage.setItem('direct', '1'));
  out.b_direct_after_write = await w.evaluate(() => window.readBack());
  await w.close();
  // c
  await b.close(); await sleep(500);
  out.c_baseline_embedded_before_remove = await readEmbedded();
  out.c_baseline_direct_before_remove = await readDirect();
  // d
  out.d_remove_widget = await call('browsingDataRemove', { options: { origins: ['https://widget.test'] }, types: { localStorage: true, indexedDB: true } });
  await sleep(500);
  // e, f
  out.e_embedded_after_remove = await readEmbedded();
  out.f_direct_after_remove = await readDirect();
  // g
  out.g1_remove_b = await call('browsingDataRemove', { options: { origins: ['https://b.test'] }, types: { localStorage: true, indexedDB: true } });
  await sleep(500);
  out.g1_embedded_after_remove_b = await readEmbedded();
  out.g2_remove_noFilter = await call('browsingDataRemove', { options: {}, types: { localStorage: true, indexedDB: true } });
  await sleep(500);
  out.g2_embedded_after_remove_all = await readEmbedded();
  // h: a.test cache storage & service worker
  const a = await ctx.newPage(); await a.goto('https://a.test/', { waitUntil: 'load' }); await a.evaluate(() => window.setupDone);
  out.h_a_after_write = await a.evaluate(() => window.readBack());
  await a.close(); await sleep(500);
  out.h_a_baseline_before_remove = await readA();
  out.h_remove_cacheStorage = await call('browsingDataRemove', { options: { origins: ['https://a.test'] }, types: { cacheStorage: true } });
  await sleep(500);
  out.h_a_after_cacheStorage_remove = await readA();
  out.h_remove_serviceWorkers = await call('browsingDataRemove', { options: { origins: ['https://a.test'] }, types: { serviceWorkers: true } });
  await sleep(500);
  out.h_a_after_serviceWorkers_remove = await readA();
  out.h_remove_ls_idb_a = await call('browsingDataRemove', { options: { origins: ['https://a.test'] }, types: { localStorage: true, indexedDB: true } });
  await sleep(500);
  out.h_a_after_ls_idb_remove = await readA();
  fs.writeFileSync('results/spike2.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });

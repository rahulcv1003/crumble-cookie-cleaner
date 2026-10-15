const { launch, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
(async () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's2g2-'));
  const { ctx, call } = await launch(dir); const out = {};
  const readEmbedded = async () => { const p = await ctx.newPage(); await p.goto('https://b.test/ro', { waitUntil: 'load' }); const f = p.frames().find(f => f.url().startsWith('https://widget.test/')); const r = await f.evaluate(() => window.readBack()); await p.close(); return r; };
  const b = await ctx.newPage(); await b.goto('https://b.test/', { waitUntil: 'load' });
  await b.frames().find(f => f.url().startsWith('https://widget.test/')).evaluate(() => window.idbDone); await b.close();
  out.before = await readEmbedded();
  out.remove_noFilter = await call('browsingDataRemove', { options: {}, types: { localStorage: true, indexedDB: true } });
  await sleep(500);
  out.after = await readEmbedded();
  // also: does origins filter listing BOTH widget.test and b.test clear only the needed ones? (b.test included)
  fs.writeFileSync('results/spike2g2.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2)); await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });

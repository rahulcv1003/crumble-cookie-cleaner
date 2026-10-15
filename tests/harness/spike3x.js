const { launch, sleep, trimCookie } = require('./lib'); const fs = require('fs'), path = require('path');
(async () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's3x-'));
  const { ctx, call, sw } = await launch(dir); const out = {};
  out.s3_viaMessage = await call('hasPublicSuffix');
  out.s3_direct_sw_eval = await sw.evaluate(() => ({ typeofPublicSuffix: typeof chrome.publicSuffix, chromeKeys: Object.keys(chrome).sort() }));
  const a = await ctx.newPage(); await a.goto('https://a.test/', { waitUntil: 'load' }); await a.evaluate(() => window.setupDone);
  out.x1_tabsQuery = await call('tabsQuery');
  out.x2_cookieStores = await call('getAllCookieStores');
  // X2 extra: with an incognito context? not available in persistent ctx; note only.
  fs.writeFileSync('results/spike3x.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2)); await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });

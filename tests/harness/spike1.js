const { launch, trimCookie, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const T = c => c.map(trimCookie);
(async () => {
  const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 's1-'));
  const { ctx, call } = await launch(dir); const out = {};
  const b = await ctx.newPage(); await b.goto('https://b.test/', { waitUntil: 'load' });
  const wf = b.frames().find(f => f.url().startsWith('https://widget.test/'));
  await wf.evaluate(() => window.idbDone);
  out.iframeDocumentCookie = await wf.evaluate(() => document.cookie);
  // 1b
  out.b_getAll_noKey_all = T((await call('cookiesGetAll', {})));
  out.b_getAll_noKey_domainWidget = T(await call('cookiesGetAll', { domain: 'widget.test' }));
  // 1c
  const withKey = await call('cookiesGetAll', { partitionKey: {} });
  out.c_getAll_partitionKeyEmpty_all = T(withKey);
  const part = withKey.find(c => c.name === 'part' && c.domain.includes('widget.test'));
  out.c_partCookieFull = trimCookie(part);
  // 1d
  out.d_remove_noKey = await call('cookiesRemove', { url: 'https://widget.test/', name: 'part' });
  out.d_after = T((await call('cookiesGetAll', { partitionKey: {} })).filter(c => c.domain.includes('widget.test')));
  // 1e
  out.e_remove_withKey = await call('cookiesRemove', { url: 'https://widget.test/', name: 'part', partitionKey: part.partitionKey });
  out.e_after = T((await call('cookiesGetAll', { partitionKey: {} })).filter(c => c.domain.includes('widget.test')));
  // 1f: visit a.test
  const a = await ctx.newPage(); await a.goto('https://a.test/', { waitUntil: 'load' }); await a.evaluate(() => window.setupDone); await sleep(500);
  out.f_getAll_partitionKeyEmpty_after_a = T(await call('cookiesGetAll', { partitionKey: {} }));
  out.f_getAll_noKey_after_a = T(await call('cookiesGetAll', {}));
  // 1g: restore
  const setDetails = { url: 'https://widget.test/', name: part.name, value: part.value, path: part.path, secure: part.secure, httpOnly: part.httpOnly, sameSite: part.sameSite, partitionKey: part.partitionKey };
  if (!part.session && part.expirationDate) setDetails.expirationDate = part.expirationDate;
  out.g_setDetails = { ...setDetails, value: setDetails.value.slice(0, 10) };
  out.g_set_result = await call('cookiesSet', setDetails);
  if (out.g_set_result.result) out.g_set_result.result = trimCookie(out.g_set_result.result);
  out.g_after = T((await call('cookiesGetAll', { partitionKey: {} })).filter(c => c.domain.includes('widget.test')));
  // does page see restored cookie? reload b.test iframe (read-only embed)
  await b.goto('https://b.test/ro', { waitUntil: 'load' });
  const wf2 = b.frames().find(f => f.url().startsWith('https://widget.test/'));
  out.g_iframeDocumentCookie_after_restore = await wf2.evaluate(() => document.cookie);
  // Extra: hasCrossSiteAncestor:true variant via set
  out.g_extra_set_crossSiteAncestorTrue = await call('cookiesSet', { url: 'https://widget.test/', name: 'xs', value: '1', secure: true, sameSite: 'no_restriction', partitionKey: { topLevelSite: 'https://b.test', hasCrossSiteAncestor: true } });
  out.g_extra_set_topLevelOnly = await call('cookiesSet', { url: 'https://widget.test/', name: 'tlo', value: '1', secure: true, sameSite: 'no_restriction', partitionKey: { topLevelSite: 'https://b.test' } });
  out.g_extra_after = T((await call('cookiesGetAll', { partitionKey: {} })).filter(c => c.domain.includes('widget.test')));
  fs.writeFileSync('results/spike1.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });

const { launch } = require('./lib'); const os = require('os'), fs = require('fs'), path = require('path');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crumble-smoke-'));
  const { ctx, call, extId } = await launch(dir);
  const p = await ctx.newPage(); await p.goto('https://b.test/');
  console.log('extId', extId, await call('ping'));
  console.log('ua', await p.evaluate(() => navigator.userAgent));
  const v = await p.goto('chrome://version'); console.log((await p.innerText('body')).split('\n').filter(l => /Chromium|Command Line|Executable/i.test(l)).join('\n').slice(0, 3000));
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });

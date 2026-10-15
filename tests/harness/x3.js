const { launch } = require('./lib'); const fs = require('fs'), path = require('path'), os = require('os');
(async () => {
  const out = { machine: { cpus: os.cpus().length, model: os.cpus()[0].model, memGB: +(os.totalmem() / 2 ** 30).toFixed(1) }, sameRegistrableDomain: [], distinctRegistrableDomains: [] };
  for (const [key, tmpl, opts] of [['sameRegistrableDomain', 'https://h{h}.seed.test/', { suffix: '.seed.test' }], ['distinctRegistrableDomains', 'https://h{h}.test/', { re: '^h\\d+\\.test$' }]]) {
    for (let i = 0; i < 3; i++) {
      const dir = fs.mkdtempSync(path.join(__dirname, 'profiles', 'x3-'));
      const { ctx, call } = await launch(dir);
      const seed = await call('seedCookies', { hosts: 500, perHost: 10, tmpl });
      const timing = await call('timeGetAllAndRemove', opts);
      out[key].push({ seed, timing }); await ctx.close();
    }
  }
  fs.writeFileSync('results/x3.json', JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });

// Shared launch helpers for the spike runs.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { chromiumSwitches } = require(require('path').join(__dirname, 'node_modules/playwright-core/lib/server/chromium/chromiumSwitches.js'));
const EXT = path.join(__dirname, 'spike-extension');

function defaultDisableFeaturesArg() {
  return chromiumSwitches(false).find(a => a.startsWith('--disable-features='));
}
// Same disabled-feature list as Playwright, minus ThirdPartyStoragePartitioning (so storage partitioning matches real Chrome).
function ourDisableFeaturesArg() {
  const list = defaultDisableFeaturesArg().replace('--disable-features=', '').split(',').filter(f => f && f !== 'ThirdPartyStoragePartitioning');
  return '--disable-features=' + list.join(',');
}
function writeThirdPartyCookiePrefs(userDataDir) {
  const d = path.join(userDataDir, 'Default'); fs.mkdirSync(d, { recursive: true });
  const p = path.join(d, 'Preferences');
  let prefs = {}; try { prefs = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  prefs.profile = prefs.profile || {};
  prefs.profile.cookie_controls_mode = 0;          // 0 = allow third-party cookies
  prefs.profile.block_third_party_cookies = false;
  fs.writeFileSync(p, JSON.stringify(prefs));
}
async function launch(userDataDir, { loadExt = true } = {}) {
  writeThirdPartyCookiePrefs(userDataDir);
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions', defaultDisableFeaturesArg()],
    args: [
      ...(loadExt ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : []),
      '--host-resolver-rules=MAP *.test 127.0.0.1',
      '--ignore-certificate-errors',
      '--no-proxy-server',
      ourDisableFeaturesArg(),
    ],
    ignoreHTTPSErrors: true,
  });
  let sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];
  const runner = await ctx.newPage();
  await runner.goto(`chrome-extension://${extId}/runner.html`);
  const call = async (cmd, args) => {
    const r = await runner.evaluate(([c, a]) => window.send(c, a), [cmd, args]);
    if (!r || r.error) throw new Error(`${cmd} failed: ${JSON.stringify(r)}`);
    return r.data;
  };
  return { ctx, extId, runner, call, sw };
}
const trimCookie = c => ({ ...c, value: String(c.value).slice(0, 10) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { launch, trimCookie, sleep, ourDisableFeaturesArg, EXT };

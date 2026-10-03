#!/usr/bin/env bash
# MED capture.sh — screenshot CAPTURE_URL (desktop + mobile) into CAPTURE_DIR.
# Leaves the app running. Exit 75 = transient nav/browser failure, 1 = script/render defect.
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p test -n "${CAPTURE_URL:-}" || { echo 'CAPTURE_URL is required.' >&2; exit 1; }
/usr/bin/time -p test -n "${CAPTURE_DIR:-}" || { echo 'CAPTURE_DIR is required.' >&2; exit 1; }
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node - "$CAPTURE_URL" "$CAPTURE_DIR" <<'NODEEOF'
const { createRequire } = require('node:module');
const { readFileSync, mkdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');
const url = process.argv[2], output = process.argv[3];
if (!url || !output) { console.error('CAPTURE_URL and CAPTURE_DIR required'); process.exit(1); }
mkdirSync(output, { recursive: true });
const homeRuntime = join(os.homedir(), '.local/share/omgithub-playwright');
const cfgName = process.platform === 'darwin' ? 'metal.json' : 'linux.json';
let runtime = homeRuntime;
try { readFileSync(join(homeRuntime, cfgName)); }
catch { runtime = process.env.RUNTIME_DIR || homeRuntime; }
let cfg;
try {
  cfg = JSON.parse(readFileSync(join(runtime, cfgName), 'utf8'));
} catch (e) { console.error('playwright config missing: ' + e.message); process.exit(1); }
if (process.platform === 'linux') {
  try { process.env.DISPLAY = ':' + readFileSync(join(runtime, 'display'), 'utf8').trim(); }
  catch (e) { console.error('display file missing: ' + e.message); process.exit(75); }
}
const req = createRequire(join(runtime, 'package.json'));
const { chromium } = req('playwright');
const transient = (e, msg) => { console.error((msg || 'transient failure') + ': ' + (e && e.message ? e.message : e)); process.exit(75); };
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ ...cfg.browser.launchOptions, timeout: 30000 }).catch(e => transient(e, 'browser launch'));
    for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } }).catch(e => transient(e, 'new page'));
      page.setDefaultTimeout(30000);
      page.on('pageerror', e => console.error('pageerror: ' + e.message));
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(e => transient(e, 'navigation'));
      const st = resp ? resp.status() : 0;
      if (!resp || ![200, 304].includes(st)) {
        console.error(`HTTP ${st} loading ${url}`);
        process.exit(!resp || [408, 429, 500, 502, 503, 504].includes(st) ? 75 : 1);
      }
      try {
        await page.locator('.splash-card, body').first().waitFor({ state: 'visible', timeout: 20000 });
        await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500);
      } catch (e) { console.error('render wait failed: ' + e.message); process.exit(1); }
      const shot = join(output, `final-${name}.png`);
      await page.screenshot({ path: shot, timeout: 30000 }).catch(e => {
        if (e.name === 'TimeoutError' || !browser.isConnected()) transient(e, 'screenshot');
        console.error('screenshot failed: ' + e.message); process.exit(1);
      });
      try {
        if (statSync(shot).size === 0) { console.error('empty screenshot: ' + shot); process.exit(1); }
      } catch (e) { console.error('screenshot missing: ' + shot); process.exit(1); }
      console.log(`captured ${shot}`);
      await page.close();
    }
  } catch (e) {
    console.error(e);
    process.exitCode = process.exitCode || 1;
  } finally {
    if (browser) await browser.close().catch(e => { console.error('browser close: ' + e.message); process.exitCode = process.exitCode || 75; });
  }
})();
NODEEOF
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p ls -la "$CAPTURE_DIR"

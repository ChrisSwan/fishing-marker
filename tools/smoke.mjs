// End-to-end smoke test: headless Chrome with a fake camera, driven over the DevTools protocol.
// Usage: node tools/smoke.mjs   (starts its own static server; needs Chrome or Edge installed)
//        SMOKE_SHOT=shot.png node tools/smoke.mjs   also saves a screenshot after the first marker is placed
// Zero dependencies (Node 22+ global WebSocket).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) { console.error('No Chrome/Edge found'); process.exit(2); }

const PORT = 8091;
const DEBUG_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`); };

const server = spawn(process.execPath, ['tools/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'fm-smoke-'));
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--window-size=412,860',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

async function targetWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('browser did not start');
}

const errors = [];
let nextUpload = '';
let mainNavigations = 0;
let ws;
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression, userGesture = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(expression).catch(() => false)) return true; // page may be mid-navigation
    await sleep(100);
  }
  return false;
}
async function tap(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}
async function drag(x1, y1, x2, y2) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 5; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 5, y: y1 + ((y2 - y1) * i) / 5, button: 'left', buttons: 1 });
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
}
const click = (id) => evaluate(`document.getElementById('${id}').click()`, true);
const swim = () => evaluate(`JSON.parse(localStorage.getItem('fishingMarker.swim.v1'))`);
const visible = (id) => evaluate(`!document.getElementById('${id}').hidden`);

try {
  ws = new WebSocket(await targetWs());
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true });
    } else if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) {
      mainNavigations++;
    } else if (msg.method === 'Page.fileChooserOpened') {
      send('DOM.setFileInputFiles', { files: [nextUpload], backendNodeId: msg.params.backendNodeId });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  const url = `http://localhost:${PORT}/`;

  // --- unit tests in the browser
  await send('Page.navigate', { url: `${url}tests/test.html` });
  check('browser unit tests all pass', await waitFor(`/(\\d+)\\/\\1 passed/.test(document.getElementById('out').textContent)`),
    await evaluate(`document.getElementById('out').textContent.slice(-200)`).catch(() => ''));

  // --- first run: setup
  await send('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta: 90, gamma: 0 });
  await send('Page.navigate', { url });
  check('camera starts (fake device)', await waitFor(`document.getElementById('video').videoWidth > 0`));
  check('badge says freeze to align', (await evaluate(`document.getElementById('badge').textContent`)) === 'LIVE — freeze to align');
  const rect = await evaluate(`(() => { const r = document.getElementById('overlay').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const cx = rect.x + rect.w / 2;

  await click('btn-freeze');
  check('freeze shows Confirm lines', await visible('btn-confirm'));
  // the far line's left handle must be on screen (10% in from the visible left edge) and draggable sideways
  await drag(rect.x + rect.w * 0.1, rect.y + rect.h * 0.45, rect.x + rect.w * 0.1 + 20, rect.y + rect.h * 0.45);
  await tap(cx, rect.y + rect.h * 0.6);
  check('tap before confirm is refused', (await evaluate(`document.getElementById('status').textContent`)).includes('Confirm the lines first'));

  // drag the near line body up a little (it sits at 90% height)
  await drag(cx + 30, rect.y + rect.h * 0.9, cx + 30, rect.y + rect.h * 0.85);
  await click('btn-confirm');
  await waitFor(`!!JSON.parse(localStorage.getItem('fishingMarker.swim.v1') || 'null')?.reference`);
  let s = await swim();
  check('confirm saves reference image + lines', !!s?.reference?.image?.startsWith('data:image/jpeg') && !!s.currentLines);
  check('line drag moved the near line', s && Math.abs(s.currentLines.near.p1.y - 0.85) < 0.01, JSON.stringify(s?.currentLines?.near));
  check('default handles are on screen and draggable', s && Math.abs(s.currentLines.far.p1.y - 0.45) < 1e-9
    && Math.abs(s.currentLines.far.p1.x - 0.1) > 0.01, JSON.stringify(s?.currentLines?.far));

  // place blue at 60% height, centre
  await tap(cx, rect.y + rect.h * 0.6);
  s = await swim();
  check('blue marker stored as ratios', s?.markers?.blue && Math.abs(s.markers.blue.s - 0.5) < 0.02 && Math.abs(s.markers.blue.r - (0.85 - 0.6) / (0.85 - 0.45)) < 0.02, JSON.stringify(s?.markers));

  if (process.env.SMOKE_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.SMOKE_SHOT, Buffer.from(shot.data, 'base64'));
  }

  // red marker elsewhere, then drag it
  await evaluate(`document.querySelector('.chip[data-colour="red"]').click()`);
  await tap(cx - 80, rect.y + rect.h * 0.7);
  const redBefore = (await swim()).markers.red;
  await drag(cx - 80, rect.y + rect.h * 0.7, cx - 40, rect.y + rect.h * 0.65);
  const redAfter = (await swim()).markers.red;
  check('red marker placed and dragged', !!redBefore && !!redAfter && redAfter.s > redBefore.s && redAfter.r > redBefore.r, JSON.stringify({ redBefore, redAfter }));

  // delete red
  check('bin shows for selected marker', await visible('btn-delete'));
  await click('btn-delete');
  check('red marker deleted', (await swim()).markers.red === null);

  // measure mode
  await click('btn-measure');
  await tap(cx + 40, rect.y + rect.h * 0.55);
  check('measure logs a measurement', (await swim()).measurements.length === 1);
  await click('btn-measure');

  // go live; gyro: live overlay follows orientation (camera turned 5° left -> overlay shifts right)
  await click('btn-freeze');
  check('live badge shows gyro tracking', await waitFor(`document.getElementById('badge').textContent === 'LIVE ≈'`, 3000),
    await evaluate(`document.getElementById('badge').textContent`));
  const pixel = (x, y) => evaluate(`(() => { const c = document.getElementById('overlay'); const d = window.devicePixelRatio || 1;
    return Array.from(c.getContext('2d').getImageData(Math.round(${x} * d), Math.round(${y} * d), 1, 1).data); })()`);
  const isBlue = (p) => Math.abs(p[0] - 47) < 30 && Math.abs(p[1] - 123) < 30 && p[2] > 220 && p[3] > 200;
  const bx = rect.w / 2, by = rect.h * 0.6;
  await sleep(300);
  const atRest = await pixel(bx, by);
  await send('DeviceOrientation.setDeviceOrientationOverride', { alpha: 5, beta: 90, gamma: 0 });
  await sleep(400);
  const shift = (5 * rect.h) / 65;
  const movedFrom = await pixel(bx, by);
  const movedTo = await pixel(bx + shift, by);
  check('gyro shifts the overlay the right way', isBlue(atRest) && !isBlue(movedFrom) && isBlue(movedTo),
    JSON.stringify({ atRest, movedFrom, movedTo }));

  // re-freeze in the same session (phone now turned 5°): lines unlocked for checking, markers still shown
  await click('btn-freeze');
  check('re-freeze starts unlocked with markers visible', (await visible('btn-confirm')) && !(await visible('btn-lock'))
    && isBlue(await pixel(bx, by)));
  // go live without confirming: the overlay must stay anchored to the pose the lines were aligned at
  await click('btn-freeze');
  await sleep(400);
  check('unconfirmed re-freeze keeps the aligned gyro baseline', isBlue(await pixel(bx + shift, by)),
    JSON.stringify({ at: await pixel(bx + shift, by), still: await pixel(bx, by) }));
  await send('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta: 90, gamma: 0 });

  // reload -> ghost re-alignment
  await send('Page.navigate', { url });
  await waitFor(`document.getElementById('video').videoWidth > 0`);
  await click('btn-freeze');
  check('after reload: ghost on, lines unlocked', (await visible('btn-ghost')) && (await visible('btn-confirm'))
    && (await evaluate(`document.getElementById('btn-ghost').classList.contains('active')`)));
  await click('btn-confirm');
  s = await swim();
  check('blue marker survives reload', !!s.markers.blue);

  // --- menu: settings
  const menu = (action) => evaluate(`document.getElementById('btn-menu').click(); document.querySelector('[data-action="${action}"]').click()`, true);
  const status = () => evaluate(`document.getElementById('status').textContent`);
  await menu('settings');
  await evaluate(`(() => { const el = document.getElementById('set-ellipse'); el.value = '0.1'; el.dispatchEvent(new Event('input')); })()`);
  check('settings slider updates the swim', (await swim()).settings.ellipseWidth === 0.1);
  await click('settings-close');

  // --- menu: measurement log
  await menu('log');
  check('measurement log lists the measurement', (await evaluate(`document.getElementById('log-list').textContent`)).includes('r '));
  await click('log-close');

  // --- menu: export
  await menu('export');
  check('export reports success', await waitFor(`/Swim (shared|saved)/.test(document.getElementById('status').textContent)`, 5000), await status());

  // --- menu: import (bad file, then good file)
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  const junk = join(profile, 'photo.jpg');
  writeFileSync(junk, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
  const before = JSON.stringify(await swim());
  nextUpload = junk;
  await menu('import');
  check('importing a non-swim file is refused', await waitFor(`document.getElementById('status').textContent.includes("isn't a Fishing Marker swim")`, 5000), await status());
  check('swim untouched after bad import', JSON.stringify(await swim()) === before);

  const good = JSON.parse(before);
  good.markers.green = { r: 0.3, s: 0.2, placedAt: '2026-10-01T10:00:00.000Z' };
  const goodFile = join(profile, 'swim.json');
  writeFileSync(goodFile, JSON.stringify(good));
  nextUpload = goodFile;
  await menu('import');
  check('importing a swim file replaces the swim', await waitFor(`!!JSON.parse(localStorage.getItem('fishingMarker.swim.v1')).markers.green`, 5000));

  // --- menu: reset
  await menu('reset');
  s = await swim();
  check('reset clears reference and markers', s.reference === null && s.markers.blue === null && s.measurements.length === 0);

  // --- storage full: the "Not saved" warning must survive later status messages
  await click('btn-freeze');
  await evaluate(`Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }`);
  await click('btn-confirm');
  await sleep(300);
  check('save failure warning stays visible', await evaluate(`document.getElementById('warn')?.hidden === false
    && document.getElementById('warn').textContent.includes('Not saved')`), await status());
  await send('Page.navigate', { url }); // restores the real Storage.prototype.setItem
  await waitFor(`document.getElementById('video').videoWidth > 0`);

  // --- unreadable stored swim is protected
  await evaluate(`localStorage.setItem('fishingMarker.swim.v1', '{broken')`);
  await send('Page.navigate', { url });
  check('unreadable swim opens the protection dialog', await waitFor(`document.getElementById('load-error').open`));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Escape does not dismiss it', await evaluate(`document.getElementById('load-error').open`));
  check('raw data still stored', (await evaluate(`localStorage.getItem('fishingMarker.swim.v1')`)) === '{broken');
  await click('load-error-discard');
  check('discard closes it and starts a fresh swim', !(await evaluate(`document.getElementById('load-error').open`))
    && (await swim())?.version === 1);

  // --- camera blocked: the permission message must survive tapping Freeze
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));`,
  });
  await send('Page.navigate', { url });
  check('camera denied shows the permission message', await waitFor(`document.getElementById('status').textContent.includes('permission')`, 5000), await status());
  await click('btn-freeze');
  check('permission message survives tapping Freeze', (await status()).includes('permission'), await status());
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

  // --- installable + offline (service worker is skipped on 'localhost', so use [::1])
  const manifest = await send('Page.getAppManifest');
  check('manifest parses without errors', manifest.errors.length === 0 && manifest.data.includes('Fishing Marker'), JSON.stringify(manifest.errors));
  const swUrl = `http://[::1]:${PORT}/`;
  mainNavigations = 0;
  await send('Page.navigate', { url: swUrl });
  await waitFor(`navigator.serviceWorker.ready.then(() => true)`, 8000);
  await sleep(1500);
  check('first visit is not reloaded by the service worker', mainNavigations === 1, `main-frame navigations: ${mainNavigations}`);
  check('service worker takes control', await waitFor(`!!navigator.serviceWorker.controller`, 8000));
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.reload');
  check('app loads offline', await waitFor(`document.getElementById('btn-freeze')?.textContent === 'Freeze' && !!document.querySelector('script[src="js/app.js"]')`, 8000)
    && await waitFor(`document.getElementById('badge').textContent.startsWith('LIVE')`, 8000));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('smoke run completed', false, err.stack || String(err));
} finally {
  ws?.close();
  browser.kill();
  server.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold files */ }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

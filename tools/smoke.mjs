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
let ws;
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(expression)) return true;
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
const click = (id) => evaluate(`document.getElementById('${id}').click()`);
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
  await send('Page.navigate', { url });
  check('camera starts (fake device)', await waitFor(`document.getElementById('video').videoWidth > 0`));
  check('badge says freeze to align', (await evaluate(`document.getElementById('badge').textContent`)) === 'LIVE — freeze to align');
  const rect = await evaluate(`(() => { const r = document.getElementById('overlay').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const cx = rect.x + rect.w / 2;

  await click('btn-freeze');
  check('freeze shows Confirm lines', await visible('btn-confirm'));
  await tap(cx, rect.y + rect.h * 0.6);
  check('tap before confirm is refused', (await evaluate(`document.getElementById('status').textContent`)).includes('Confirm the lines first'));

  // drag the near line body up a little (it sits at 90% height)
  await drag(cx + 30, rect.y + rect.h * 0.9, cx + 30, rect.y + rect.h * 0.85);
  await click('btn-confirm');
  await waitFor(`!!JSON.parse(localStorage.getItem('fishingMarker.swim.v1') || 'null')?.reference`);
  let s = await swim();
  check('confirm saves reference image + lines', !!s?.reference?.image?.startsWith('data:image/jpeg') && !!s.currentLines);
  check('line drag moved the near line', s && Math.abs(s.currentLines.near.p1.y - 0.85) < 0.01, JSON.stringify(s?.currentLines?.near));

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

  // live, then freeze again in the same session -> locked
  await click('btn-freeze');
  await click('btn-freeze');
  check('second freeze in session starts locked', (await visible('btn-lock')) && !(await visible('btn-confirm')));
  await click('btn-freeze');

  // reload -> ghost re-alignment
  await send('Page.navigate', { url });
  await waitFor(`document.getElementById('video').videoWidth > 0`);
  await click('btn-freeze');
  check('after reload: ghost on, lines unlocked', (await visible('btn-ghost')) && (await visible('btn-confirm'))
    && (await evaluate(`document.getElementById('btn-ghost').classList.contains('active')`)));
  await click('btn-confirm');
  s = await swim();
  check('blue marker survives reload', !!s.markers.blue);

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

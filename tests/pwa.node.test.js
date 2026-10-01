import { test, assertEqual, assertTrue } from './runner.js';
import { readFileSync, existsSync } from 'node:fs';
import { VERSION } from '../js/version.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('sw.js VERSION matches js/version.js', () => {
  const m = read('sw.js').match(/const VERSION = '([^']+)'/);
  assertTrue(m, 'sw.js has no VERSION constant');
  assertEqual(m[1], VERSION);
});

test('every ASSETS entry in sw.js exists', () => {
  const list = read('sw.js').match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const p of list) if (p !== './') assertTrue(existsSync(new URL(p, root)), `missing ${p}`);
});

test('every js/*.js module is cached for offline use', () => {
  const sw = read('sw.js');
  for (const f of ['app', 'version', 'geometry', 'viewport', 'storage', 'swim', 'overlay', 'input', 'camera', 'transfer', 'gyro']) {
    assertTrue(sw.includes(`'./js/${f}.js'`), `sw.js does not cache js/${f}.js`);
  }
});

test('manifest is portrait, fullscreen, with existing 192 and 512 icons', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assertEqual([m.display, m.orientation], ['fullscreen', 'portrait']);
  for (const size of ['192x192', '512x512']) {
    const icon = m.icons.find((i) => i.sizes === size);
    assertTrue(icon && existsSync(new URL(icon.src, root)), `icon ${size} missing`);
  }
});

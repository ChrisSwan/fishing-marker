import { test, assertEqual, assertTrue } from './runner.js';
import { createSwim, defaultLines } from '../js/storage.js';
import { exportFilename, serializeSwim, parseImport, exportText } from '../js/transfer.js';

test('exportFilename uses local date/time', () => {
  assertEqual(exportFilename(new Date(2026, 9, 1, 7, 5)), 'fishing-marker-swim-20261001-0705.json');
});

test('serialize -> parseImport round trip', () => {
  const swim = createSwim();
  swim.currentLines = defaultLines();
  const res = parseImport(serializeSwim(swim));
  assertTrue(res.ok);
  assertEqual(res.swim, swim);
});

test('parseImport rejects non-JSON, empty and wrong-shape files', () => {
  for (const text of ['', 'ÿØÿà JFIF', '{"version":1', '{"hello":"world"}', '[]']) {
    const res = parseImport(text);
    assertEqual(res.ok, false, `for ${JSON.stringify(text)}`);
    assertTrue(res.error.length > 0);
  }
});

const fakeDoc = (clicked) => ({
  body: { appendChild() {} },
  createElement: () => ({ click() { clicked.push(this.download); }, remove() {} }),
});

test('exportText shares JSON when allowed', async () => {
  const shared = [];
  const nav = { canShare: () => true, share: async ({ files }) => { shared.push(files[0].name); } };
  assertEqual(await exportText('{}', 'a.json', { nav, doc: fakeDoc([]) }), 'shared');
  assertEqual(shared, ['a.json']);
});

test('exportText falls back to .txt when JSON sharing is refused', async () => {
  const shared = [];
  const nav = { canShare: ({ files }) => files[0].type === 'text/plain', share: async ({ files }) => { shared.push(files[0].name); } };
  assertEqual(await exportText('{}', 'a.json', { nav, doc: fakeDoc([]) }), 'shared-txt');
  assertEqual(shared, ['a.txt']);
});

test('exportText reports a cancelled share', async () => {
  const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } };
  assertEqual(await exportText('{}', 'a.json', { nav, doc: fakeDoc([]) }), 'cancelled');
});

test('exportText downloads when sharing is unavailable', async () => {
  const clicked = [];
  assertEqual(await exportText('{}', 'a.json', { nav: {}, doc: fakeDoc(clicked) }), 'downloaded');
  assertEqual(clicked, ['a.json']);
});

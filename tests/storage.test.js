import { test, assertEqual, assertTrue } from './runner.js';
import {
  STORAGE_KEY, createSwim, defaultLines, validateSwim, loadSwim, saveSwim, openSwimStore, requestPersistence,
} from '../js/storage.js';

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), peek: (k) => m.get(k) };
}
const throwingStore = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
});

test('createSwim is valid and has spec defaults', () => {
  const s = createSwim();
  assertEqual(validateSwim(s), { ok: true });
  assertEqual(s.settings, { ellipseWidth: 0.05, ghostOpacity: 0.4, fovDegrees: 65 });
  assertEqual(s.markers, { blue: null, green: null, red: null });
});

test('defaultLines match the spec', () => {
  const l = defaultLines();
  assertEqual([l.far.p1.y, l.far.p2.y, l.near.p1.y, l.anchorA.x, l.anchorB.x], [0.45, 0.45, 0.9, 0.3, 0.7]);
});

test('empty store -> status new', () => {
  assertEqual(loadSwim(memStore()).status, 'new');
});

test('save -> load round trip', () => {
  const store = memStore();
  const swim = createSwim();
  swim.currentLines = defaultLines();
  swim.markers.red = { r: 0.8, s: 0.4, placedAt: '2026-10-01T10:00:00.000Z' };
  assertEqual(saveSwim(swim, store), { ok: true });
  const loaded = loadSwim(store);
  assertEqual(loaded.status, 'loaded');
  assertEqual(loaded.swim, swim);
});

test('corrupt JSON -> error with raw, store blocks saving until discarded', () => {
  const store = memStore({ [STORAGE_KEY]: '{not json' });
  const opened = openSwimStore(store);
  assertEqual(opened.status, 'error');
  assertEqual(opened.raw, '{not json');
  assertTrue(opened.blocked);
  assertEqual(opened.save(createSwim()).ok, false);
  assertEqual(store.peek(STORAGE_KEY), '{not json');
  opened.discardRaw();
  assertEqual(opened.blocked, false);
  assertEqual(opened.save(createSwim()).ok, true);
});

test('newer schema version is refused and protected', () => {
  const store = memStore({ [STORAGE_KEY]: JSON.stringify({ ...createSwim(), version: 2 }) });
  const opened = openSwimStore(store);
  assertEqual(opened.status, 'error');
  assertTrue(opened.error.includes('version'));
  assertTrue(opened.blocked);
});

test('malformed marker is rejected by validateSwim', () => {
  const s = createSwim();
  s.markers.blue = { r: 'x', s: 0.1 };
  assertEqual(validateSwim(s).ok, false);
});

test('storage full -> save reports a visible error', () => {
  const res = saveSwim(createSwim(), throwingStore());
  assertEqual(res.ok, false);
  assertTrue(res.error.includes('Not saved'));
});

test('storage unavailable on read -> error, not blocked (nothing to protect)', () => {
  const opened = openSwimStore(throwingStore());
  assertEqual(opened.status, 'error');
  assertEqual(opened.blocked, false);
  assertEqual(validateSwim(opened.swim), { ok: true });
});

test('requestPersistence outcomes', async () => {
  assertEqual(await requestPersistence(undefined), 'unsupported');
  assertEqual(await requestPersistence({ persisted: async () => true, persist: async () => false }), 'granted');
  assertEqual(await requestPersistence({ persisted: async () => false, persist: async () => true }), 'granted');
  assertEqual(await requestPersistence({ persisted: async () => false, persist: async () => false }), 'denied');
  assertEqual(await requestPersistence({ persisted: async () => { throw new Error('x'); }, persist: async () => true }), 'denied');
});

test('defaultLines can be fitted to the visible part of the frame', () => {
  const l = defaultLines({ x0: 0.2, x1: 0.8 });
  for (const [got, want] of [[l.far.p1.x, 0.26], [l.far.p2.x, 0.74], [l.near.p1.x, 0.26], [l.near.p2.x, 0.74], [l.anchorA.x, 0.38], [l.anchorB.x, 0.62]]) {
    assertTrue(Math.abs(got - want) < 1e-9, `expected ${want}, got ${got}`);
  }
  assertEqual([l.far.p1.y, l.near.p1.y], [0.45, 0.9]);
});

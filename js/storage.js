// Swim schema, defaults and persistence (spec §6).
export const STORAGE_KEY = 'fishingMarker.swim.v1';
export const SCHEMA_VERSION = 1;
export const COLOURS = ['blue', 'green', 'red'];

// x0..x1 is the visible part of the frame, so handles and anchors start on screen.
export function defaultLines({ x0 = 0, x1 = 1 } = {}) {
  const at = (f) => x0 + f * (x1 - x0);
  return {
    far: { p1: { x: at(0.1), y: 0.45 }, p2: { x: at(0.9), y: 0.45 } },
    near: { p1: { x: at(0.1), y: 0.9 }, p2: { x: at(0.9), y: 0.9 } },
    anchorA: { x: at(0.3) },
    anchorB: { x: at(0.7) },
  };
}

export function createSwim() {
  return {
    version: SCHEMA_VERSION,
    reference: null,
    currentLines: null,
    markers: { blue: null, green: null, red: null },
    measurements: [],
    settings: { ellipseWidth: 0.05, ghostOpacity: 0.4, fovDegrees: 65 },
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPt = (p) => !!p && isNum(p.x) && isNum(p.y);
const isLines = (l) => !!l && isPt(l.far?.p1) && isPt(l.far?.p2) && isPt(l.near?.p1) && isPt(l.near?.p2)
  && isNum(l.anchorA?.x) && isNum(l.anchorB?.x);

export function validateSwim(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Not a swim.' };
  if (obj.version !== SCHEMA_VERSION) return { ok: false, error: `Unsupported swim version ${obj.version}.` };
  if (obj.reference !== null && !(obj.reference && typeof obj.reference.image === 'string' && isLines(obj.reference.lines))) {
    return { ok: false, error: 'The reference is malformed.' };
  }
  if (obj.currentLines !== null && !isLines(obj.currentLines)) return { ok: false, error: 'The lines are malformed.' };
  if (!obj.markers || typeof obj.markers !== 'object') return { ok: false, error: 'The markers are missing.' };
  for (const c of COLOURS) {
    const m = obj.markers[c];
    if (m !== null && !(m && isNum(m.r) && isNum(m.s))) return { ok: false, error: `The ${c} marker is malformed.` };
  }
  if (!Array.isArray(obj.measurements)) return { ok: false, error: 'The measurement log is malformed.' };
  const s = obj.settings;
  if (!s || !isNum(s.ellipseWidth) || !isNum(s.ghostOpacity) || !isNum(s.fovDegrees)) return { ok: false, error: 'The settings are malformed.' };
  return { ok: true };
}

export function loadSwim(store) {
  let raw;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { status: 'error', swim: createSwim(), error: 'Browser storage is unavailable — nothing will be saved.', raw: null };
  }
  if (raw === null || raw === undefined) return { status: 'new', swim: createSwim() };
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { status: 'error', swim: createSwim(), error: 'The saved swim is corrupt.', raw };
  }
  const v = validateSwim(obj);
  if (!v.ok) return { status: 'error', swim: createSwim(), error: v.error, raw };
  return { status: 'loaded', swim: obj };
}

export function saveSwim(swim, store) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(swim));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Not saved — export a backup.' };
  }
}

// Wraps load/save so an unreadable stored swim is never silently overwritten.
export function openSwimStore(store) {
  const loaded = loadSwim(store);
  let blocked = loaded.status === 'error' && loaded.raw != null;
  return {
    ...loaded,
    get blocked() { return blocked; },
    save(swim) {
      if (blocked) return { ok: false, error: 'Saving is paused: an unreadable swim is stored. Export or discard it first.' };
      return saveSwim(swim, store);
    },
    discardRaw() { blocked = false; },
  };
}

export async function requestPersistence(storageManager) {
  if (!storageManager?.persist) return 'unsupported';
  try {
    if (await storageManager.persisted()) return 'granted';
    return (await storageManager.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

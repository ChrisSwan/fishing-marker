// Pure swim operations. Every function returns new objects and never mutates its inputs.
import { checkPoint, fromRatios, validateLines } from './geometry.js';
import { COLOURS } from './storage.js';

const clone = (o) => structuredClone(o);
const NOT_CONFIRMED = { ok: false, errors: ['Confirm the lines first.'], warnings: [] };

export function confirmLines(swim, lines, referenceImage = null, now = new Date()) {
  const errors = validateLines(lines);
  if (errors.length) return { swim, errors };
  const next = clone(swim);
  next.currentLines = clone(lines);
  if (referenceImage) next.reference = { image: referenceImage, lines: clone(lines), savedAt: now.toISOString() };
  return { swim: next, errors: [] };
}

export function placeMarker(swim, colour, pt, now = new Date()) {
  if (!COLOURS.includes(colour)) throw new Error(`Unknown marker colour: ${colour}`);
  if (!swim.currentLines) return { swim, result: NOT_CONFIRMED };
  const result = checkPoint(swim.currentLines, pt);
  if (!result.ok) return { swim, result };
  const next = clone(swim);
  next.markers[colour] = { r: result.r, s: result.s, placedAt: now.toISOString() };
  return { swim: next, result };
}

export function deleteMarker(swim, colour) {
  const next = clone(swim);
  next.markers[colour] = null;
  return next;
}

export function addMeasurement(swim, pt, note = '', now = new Date()) {
  if (!swim.currentLines) return { swim, result: NOT_CONFIRMED };
  const result = checkPoint(swim.currentLines, pt);
  if (!result.ok) return { swim, result };
  const next = clone(swim);
  next.measurements.push({ at: now.toISOString(), r: result.r, s: result.s, note });
  return { swim: next, result };
}

export function clearMeasurements(swim) {
  const next = clone(swim);
  next.measurements = [];
  return next;
}

export function markerPositions(swim, lines = swim.currentLines) {
  const out = {};
  for (const c of COLOURS) {
    const m = swim.markers[c];
    const p = lines && m ? fromRatios(lines, m) : null;
    out[c] = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  }
  return out;
}

export function updateSettings(swim, patch) {
  const next = clone(swim);
  Object.assign(next.settings, patch);
  return next;
}

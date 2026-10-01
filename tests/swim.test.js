import { test, assertEqual, assertClose, assertTrue } from './runner.js';
import { createSwim, defaultLines } from '../js/storage.js';
import {
  confirmLines, placeMarker, deleteMarker, addMeasurement, clearMeasurements, markerPositions, updateSettings,
} from '../js/swim.js';

const NOW = new Date('2026-10-01T10:00:00Z');
const confirmed = () => confirmLines(createSwim(), defaultLines(), 'data:image/jpeg;base64,AAAA', NOW).swim;

test('confirmLines with image sets reference and currentLines', () => {
  const s = confirmed();
  assertEqual(s.reference.image, 'data:image/jpeg;base64,AAAA');
  assertEqual(s.reference.lines, defaultLines());
  assertEqual(s.reference.savedAt, NOW.toISOString());
  assertEqual(s.currentLines, defaultLines());
});

test('re-confirm without image keeps the reference, updates currentLines', () => {
  const s = confirmed();
  const moved = defaultLines();
  moved.far.p1.y = moved.far.p2.y = 0.5;
  const s2 = confirmLines(s, moved, null, NOW).swim;
  assertEqual(s2.reference, s.reference);
  assertEqual(s2.currentLines.far.p1.y, 0.5);
});

test('confirmLines rejects invalid lines and returns the original swim', () => {
  const bad = defaultLines();
  bad.anchorB.x = 0.31;
  const original = createSwim();
  const { swim, errors } = confirmLines(original, bad, 'img', NOW);
  assertTrue(errors.length > 0);
  assertTrue(swim === original);
});

test('placeMarker before confirming lines is refused', () => {
  const { result } = placeMarker(createSwim(), 'blue', { x: 0.5, y: 0.6 }, NOW);
  assertEqual(result.ok, false);
  assertEqual(result.errors, ['Confirm the lines first.']);
});

test('placeMarker stores ratios and round-trips to the same point', () => {
  const { swim, result } = placeMarker(confirmed(), 'green', { x: 0.5, y: 0.6 }, NOW);
  assertTrue(result.ok);
  assertClose(swim.markers.green.r, (0.9 - 0.6) / (0.9 - 0.45));
  assertClose(swim.markers.green.s, 0.5);
  const pos = markerPositions(swim).green;
  assertClose(pos.x, 0.5); assertClose(pos.y, 0.6);
});

test('placing the same colour again moves it; inputs are not mutated', () => {
  const s1 = placeMarker(confirmed(), 'red', { x: 0.4, y: 0.6 }, NOW).swim;
  const snapshot = JSON.stringify(s1);
  const s2 = placeMarker(s1, 'red', { x: 0.6, y: 0.7 }, NOW).swim;
  assertEqual(JSON.stringify(s1), snapshot);
  assertClose(markerPositions(s2).red.x, 0.6);
});

test('placeMarker throws on unknown colour', () => {
  let threw = false;
  try { placeMarker(confirmed(), 'purple', { x: 0.5, y: 0.6 }, NOW); } catch { threw = true; }
  assertTrue(threw);
});

test('markers follow draft lines', () => {
  const s = placeMarker(confirmed(), 'blue', { x: 0.5, y: 0.6 }, NOW).swim;
  const shifted = defaultLines();
  for (const n of ['far', 'near']) for (const e of ['p1', 'p2']) shifted[n][e].y += 0.05;
  assertClose(markerPositions(s, shifted).blue.y, 0.65);
});

test('markerPositions returns null for invalid (vertical) lines and missing markers', () => {
  const s = placeMarker(confirmed(), 'blue', { x: 0.5, y: 0.6 }, NOW).swim;
  const bad = defaultLines();
  bad.near.p2.x = bad.near.p1.x;
  assertEqual(markerPositions(s, bad), { blue: null, green: null, red: null });
  assertEqual(markerPositions(createSwim()), { blue: null, green: null, red: null });
});

test('deleteMarker clears one colour', () => {
  const s = placeMarker(confirmed(), 'blue', { x: 0.5, y: 0.6 }, NOW).swim;
  assertEqual(deleteMarker(s, 'blue').markers.blue, null);
});

test('addMeasurement appends r/s; clearMeasurements empties', () => {
  const { swim, result } = addMeasurement(confirmed(), { x: 0.5, y: 0.6 }, 'float', NOW);
  assertTrue(result.ok);
  assertEqual(swim.measurements.length, 1);
  assertEqual(swim.measurements[0].note, 'float');
  assertEqual(clearMeasurements(swim).measurements, []);
});

test('updateSettings merges a patch', () => {
  const s = updateSettings(createSwim(), { fovDegrees: 70 });
  assertEqual(s.settings, { ellipseWidth: 0.05, ghostOpacity: 0.4, fovDegrees: 70 });
});

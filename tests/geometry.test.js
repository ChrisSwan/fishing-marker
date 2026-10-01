import { test, assertEqual, assertClose, assertTrue } from './runner.js';
import { yAt, toRatios, fromRatios, validateLines, checkPoint } from '../js/geometry.js';

const flat = () => ({
  far: { p1: { x: 0.1, y: 0.4 }, p2: { x: 0.9, y: 0.4 } },
  near: { p1: { x: 0.1, y: 0.9 }, p2: { x: 0.9, y: 0.9 } },
  anchorA: { x: 0.3 }, anchorB: { x: 0.7 },
});
const sloped = () => ({
  far: { p1: { x: 0.0, y: 0.45 }, p2: { x: 1.0, y: 0.42 } },
  near: { p1: { x: 0.2, y: 0.95 }, p2: { x: 0.8, y: 0.85 } },
  anchorA: { x: 0.35 }, anchorB: { x: 0.7 },
});

test('yAt interpolates and extrapolates', () => {
  const line = { p1: { x: 0.2, y: 0.5 }, p2: { x: 0.6, y: 0.7 } };
  assertClose(yAt(line, 0.4), 0.6);
  assertClose(yAt(line, 1.0), 0.9);
  assertClose(yAt(line, 0.0), 0.4);
});

test('yAt returns NaN for a vertical line', () => {
  assertTrue(Number.isNaN(yAt({ p1: { x: 0.5, y: 0.1 }, p2: { x: 0.5, y: 0.9 } }, 0.5)));
});

test('photo 818 known value: r ≈ 0.846', () => {
  const lines = {
    far: { p1: { x: 0, y: 0.395 }, p2: { x: 1, y: 0.395 } },
    near: { p1: { x: 0, y: 0.8 }, p2: { x: 1, y: 0.8 } },
    anchorA: { x: 0.3 }, anchorB: { x: 0.7 },
  };
  assertClose(toRatios(lines, { x: 0.55, y: 0.4575 }).r, 0.845679, 1e-5);
});

test('round trip place -> draw on flat and sloped lines', () => {
  for (const lines of [flat(), sloped()]) {
    for (const [r, s] of [[0, 0], [0.5, 0.5], [0.841, 0.44], [1, 1], [0.2, -0.3], [0.95, 1.4]]) {
      const pt = fromRatios(lines, { r, s });
      const back = toRatios(lines, pt);
      assertClose(back.r, r, 1e-9, `r for ${r},${s}`);
      assertClose(back.s, s, 1e-9, `s for ${r},${s}`);
    }
  }
});

test('round trip works with anchors swapped (B left of A)', () => {
  const lines = { ...flat(), anchorA: { x: 0.7 }, anchorB: { x: 0.3 } };
  const pt = fromRatios(lines, { r: 0.6, s: 0.25 });
  const back = toRatios(lines, pt);
  assertClose(back.r, 0.6);
  assertClose(back.s, 0.25);
  assertEqual(validateLines(lines), []);
});

test('validateLines: valid lines give no errors', () => {
  assertEqual(validateLines(flat()), []);
  assertEqual(validateLines(sloped()), []);
});

test('validateLines: vertical bank line is an error', () => {
  const lines = flat();
  lines.near.p2.x = lines.near.p1.x;
  assertTrue(validateLines(lines).some((e) => e.includes('near-bank line')));
});

test('validateLines: anchors closer than 0.05 is an error', () => {
  const lines = { ...flat(), anchorA: { x: 0.5 }, anchorB: { x: 0.54 } };
  assertTrue(validateLines(lines).some((e) => e.includes('too close')));
});

test('validateLines: near line above far line is an error', () => {
  const lines = flat();
  lines.near.p1.y = lines.near.p2.y = 0.3;
  assertTrue(validateLines(lines).some((e) => e.includes('below the far-bank')));
});

test('checkPoint: inside the lines -> ok, no warnings', () => {
  const res = checkPoint(flat(), { x: 0.5, y: 0.5 });
  assertTrue(res.ok);
  assertClose(res.r, 0.8);
  assertClose(res.s, 0.5);
  assertEqual(res.warnings, []);
});

test('checkPoint: beyond the far bank warns but is ok', () => {
  const res = checkPoint(flat(), { x: 0.5, y: 0.3 });
  assertTrue(res.ok);
  assertEqual(res.warnings.length, 1);
});

test('checkPoint: s thresholds (1.4 fine, 2.0 warns)', () => {
  const lines = flat();
  assertEqual(checkPoint(lines, fromRatios(lines, { r: 0.5, s: 1.4 })).warnings, []);
  assertEqual(checkPoint(lines, fromRatios(lines, { r: 0.5, s: 2.0 })).warnings.length, 1);
});

test('checkPoint: invalid lines -> not ok with errors', () => {
  const lines = { ...flat(), anchorB: { x: 0.31 } };
  const res = checkPoint(lines, { x: 0.5, y: 0.5 });
  assertEqual(res.ok, false);
  assertTrue(res.errors.length > 0);
});

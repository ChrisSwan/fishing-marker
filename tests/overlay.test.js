import { test, assertEqual, assertClose, assertTrue } from './runner.js';
import { coverTransform } from '../js/viewport.js';
import { defaultLines } from '../js/storage.js';
import { hitTest, dragLines, markerSize } from '../js/overlay.js';

// 1000x2000 image on a 500x1000 view: scale 0.5, no offset; screen = fraction * (500, 1000)
const scene = (over = {}) => ({
  transform: coverTransform(1000, 2000, 500, 1000),
  lines: defaultLines(), linesLocked: false,
  markers: { blue: { x: 0.5, y: 0.5 }, green: null, red: null },
  ellipseWidth: 0.1, ...over,
});

test('markerSize is 0.3 aspect of ellipseWidth * dispW', () => {
  assertEqual(markerSize(scene().transform, 0.1), { w: 50, h: 15 });
});

test('hitTest finds a marker within its bounds plus padding', () => {
  assertEqual(hitTest(scene(), 250 + 25 + 10, 500), { type: 'marker', colour: 'blue' });
  assertEqual(hitTest(scene(), 250 + 25 + 20, 500 + 30), null);
});

test('hitTest finds bank handles when unlocked, not when locked', () => {
  assertEqual(hitTest(scene(), 50, 450), { type: 'handle', line: 'far', end: 'p1' });
  assertEqual(hitTest(scene({ linesLocked: true }), 50, 450), null);
});

test('markers win over handles when overlapping', () => {
  const s = scene({ markers: { blue: null, green: { x: 0.1, y: 0.45 }, red: null } });
  assertEqual(hitTest(s, 50, 450), { type: 'marker', colour: 'green' });
});

test('hitTest finds anchors and line bodies', () => {
  assertEqual(hitTest(scene(), 150, 800), { type: 'anchor', which: 'anchorA' });
  assertEqual(hitTest(scene(), 400, 452), { type: 'line', line: 'far' });
  assertEqual(hitTest(scene(), 400, 700), null);
});

test('dragLines moves a handle, clamps an anchor, shifts a line; input untouched', () => {
  const lines = defaultLines();
  const h = dragLines(lines, { type: 'handle', line: 'far', end: 'p1' }, { dx: 0.1, dy: 0.05 });
  assertClose(h.far.p1.x, 0.2); assertClose(h.far.p1.y, 0.5);
  assertEqual(dragLines(lines, { type: 'anchor', which: 'anchorB' }, { dx: 0.5, dy: 0 }).anchorB.x, 1);
  const l = dragLines(lines, { type: 'line', line: 'near' }, { dx: 0.3, dy: -0.1 });
  assertClose(l.near.p1.y, 0.8); assertClose(l.near.p2.y, 0.8); assertClose(l.near.p1.x, 0.1);
  assertEqual(lines, defaultLines());
});

test('dragLines clamps to the given visible bounds', () => {
  const bounds = { x0: 0.2, x1: 0.8, y0: 0, y1: 1 };
  const h = dragLines(defaultLines(), { type: 'handle', line: 'far', end: 'p1' }, { dx: -0.5, dy: 0 }, bounds);
  assertClose(h.far.p1.x, 0.2);
  const a = dragLines(defaultLines(), { type: 'anchor', which: 'anchorB' }, { dx: 0.5, dy: 0 }, bounds);
  assertClose(a.anchorB.x, 0.8);
});

test('a touch just off a near-bank handle grabs the handle, not a nearby anchor', () => {
  // near p1 is at screen (50, 900); anchor A moved close to it at x = 0.14 -> screen 70
  const lines = defaultLines();
  lines.anchorA.x = 0.14;
  assertEqual(hitTest(scene({ lines, markers: { blue: null, green: null, red: null } }), 78, 905), { type: 'handle', line: 'near', end: 'p1' });
});

test('where a line crosses an anchor, the nearer one wins', () => {
  // near line at y = 900, anchor A at x = 150: touch 3px off the line, 5px off the anchor
  assertEqual(hitTest(scene({ markers: { blue: null, green: null, red: null } }), 155, 903), { type: 'line', line: 'near' });
});

test('markers have a finger-sized touch target vertically', () => {
  // marker at (250, 500) is only 15px tall; a touch 22px below its centre should still select it
  assertEqual(hitTest(scene({ linesLocked: true }), 250, 522), { type: 'marker', colour: 'blue' });
});

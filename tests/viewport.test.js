import { test, assertClose, assertEqual } from './runner.js';
import { coverTransform, screenToImage, imageToScreen } from '../js/viewport.js';

test('coverTransform crops the wider dimension', () => {
  const t = coverTransform(3000, 4000, 1000, 2000);
  assertClose(t.scale, 0.5);
  assertEqual([t.dispW, t.dispH, t.offX, t.offY], [1500, 2000, -250, 0]);
});

test('imageToScreen / screenToImage map centre and corner', () => {
  const t = coverTransform(3000, 4000, 1000, 2000);
  const c = imageToScreen(t, 0.5, 0.5);
  assertClose(c.x, 500); assertClose(c.y, 1000);
  const tl = screenToImage(t, 0, 0);
  assertClose(tl.x, 250 / 1500); assertClose(tl.y, 0);
});

test('screen -> image -> screen round trip', () => {
  const t = coverTransform(1080, 1920, 412, 780);
  for (const [sx, sy] of [[0, 0], [100, 300], [411, 779]]) {
    const img = screenToImage(t, sx, sy);
    const back = imageToScreen(t, img.x, img.y);
    assertClose(back.x, sx, 1e-9); assertClose(back.y, sy, 1e-9);
  }
});

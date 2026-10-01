// Maps between screen CSS pixels and image fractions for an `object-fit: cover` display.
export function coverTransform(imgW, imgH, viewW, viewH) {
  const scale = Math.max(viewW / imgW, viewH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  return { scale, dispW, dispH, offX: (viewW - dispW) / 2, offY: (viewH - dispH) / 2 };
}

export function screenToImage(t, sx, sy) {
  return { x: (sx - t.offX) / t.dispW, y: (sy - t.offY) / t.dispH };
}

export function imageToScreen(t, x, y) {
  return { x: t.offX + x * t.dispW, y: t.offY + y * t.dispH };
}

// The part of the image (in fractions) that is actually on screen.
export function visibleBounds(t, viewW, viewH) {
  const a = screenToImage(t, 0, 0);
  const b = screenToImage(t, viewW, viewH);
  const clip = (v) => Math.min(1, Math.max(0, v));
  return { x0: clip(a.x), x1: clip(b.x), y0: clip(a.y), y1: clip(b.y) };
}

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

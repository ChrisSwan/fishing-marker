// Hit-testing, line dragging (pure) and canvas drawing for the overlay.
import { yAt } from './geometry.js';
import { imageToScreen, screenToImage } from './viewport.js';
import { COLOURS } from './storage.js';

export const MARKER_COLOURS = { blue: '#2F7BFF', green: '#2ECC71', red: '#FF3B30' };
export const BANK_COLOUR = '#00E5FF';
export const ANCHOR_COLOUR = '#FFD60A';
export const HANDLE_RADIUS = 24;
export const LINE_TOLERANCE = 16;
export const MARKER_PADDING = 12;

export function markerSize(t, ellipseWidth) {
  const w = ellipseWidth * t.dispW;
  return { w, h: 0.3 * w };
}

export function hitTest(scene, sx, sy) {
  const t = scene.transform;
  const { w, h } = markerSize(t, scene.ellipseWidth);
  for (const c of COLOURS) {
    const m = scene.markers[c];
    if (!m) continue;
    const p = imageToScreen(t, m.x, m.y);
    if (Math.abs(sx - p.x) <= w / 2 + MARKER_PADDING && Math.abs(sy - p.y) <= h / 2 + MARKER_PADDING) return { type: 'marker', colour: c };
  }
  if (scene.linesLocked || !scene.lines) return null;
  const lines = scene.lines;
  for (const line of ['far', 'near']) {
    for (const end of ['p1', 'p2']) {
      const p = imageToScreen(t, lines[line][end].x, lines[line][end].y);
      if (Math.hypot(sx - p.x, sy - p.y) <= HANDLE_RADIUS) return { type: 'handle', line, end };
    }
  }
  for (const which of ['anchorA', 'anchorB']) {
    if (Math.abs(sx - imageToScreen(t, lines[which].x, 0).x) <= LINE_TOLERANCE) return { type: 'anchor', which };
  }
  const img = screenToImage(t, sx, sy);
  for (const line of ['far', 'near']) {
    const ly = imageToScreen(t, img.x, yAt(lines[line], img.x)).y;
    if (Math.abs(sy - ly) <= LINE_TOLERANCE) return { type: 'line', line };
  }
  return null;
}

export function dragLines(lines, hit, d) {
  const next = structuredClone(lines);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  if (hit.type === 'handle') {
    const p = next[hit.line][hit.end];
    p.x = clamp(p.x + d.dx);
    p.y = clamp(p.y + d.dy);
  } else if (hit.type === 'anchor') {
    next[hit.which].x = clamp(next[hit.which].x + d.dx);
  } else if (hit.type === 'line') {
    for (const end of ['p1', 'p2']) next[hit.line][end].y = clamp(next[hit.line][end].y + d.dy);
  }
  return next;
}

function drawLines(ctx, t, lines, { ghost, handles }) {
  ctx.save();
  ctx.lineWidth = ghost ? 2 : 3;
  ctx.setLineDash(ghost ? [10, 8] : []);
  ctx.globalAlpha = ghost ? 0.85 : 1;
  ctx.font = '600 14px system-ui, sans-serif';
  for (const name of ['far', 'near']) {
    const a = imageToScreen(t, 0, yAt(lines[name], 0));
    const b = imageToScreen(t, 1, yAt(lines[name], 1));
    ctx.strokeStyle = ghost ? '#FFFFFF' : BANK_COLOUR;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (!ghost) {
      const lx = screenToImage(t, 8, 0).x;
      const ly = imageToScreen(t, lx, yAt(lines[name], lx)).y;
      ctx.fillStyle = BANK_COLOUR;
      ctx.fillText(name === 'far' ? 'far bank' : 'near bank', 8, ly - 8);
    }
  }
  for (const [name, label] of [['anchorA', 'A'], ['anchorB', 'B']]) {
    const top = imageToScreen(t, lines[name].x, 0);
    const bottom = imageToScreen(t, lines[name].x, 1);
    ctx.strokeStyle = ghost ? '#FFFFFF' : ANCHOR_COLOUR;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke();
    if (!ghost) { ctx.fillStyle = ANCHOR_COLOUR; ctx.fillText(label, top.x + 6, Math.max(top.y, 0) + 60); }
  }
  if (handles) {
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    for (const name of ['far', 'near']) {
      for (const end of ['p1', 'p2']) {
        const p = imageToScreen(t, lines[name][end].x, lines[name][end].y);
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,229,255,0.35)'; ctx.fill();
        ctx.strokeStyle = BANK_COLOUR; ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawMarker(ctx, t, pos, colour, ellipseWidth, selected) {
  const p = imageToScreen(t, pos.x, pos.y);
  const { w, h } = markerSize(t, ellipseWidth);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(p.x, p.y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.lineWidth = 6; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = MARKER_COLOURS[colour]; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = MARKER_COLOURS[colour]; ctx.fill();
  if (selected) {
    ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#FFFFFF';
    ctx.strokeRect(p.x - w / 2 - MARKER_PADDING, p.y - h / 2 - MARKER_PADDING, w + 2 * MARKER_PADDING, h + 2 * MARKER_PADDING);
  }
  ctx.restore();
}

function drawCrosshair(ctx, t, c) {
  const p = imageToScreen(t, c.x, c.y);
  ctx.save();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y);
  ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14);
  ctx.stroke();
  ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(c.label, p.x + 18, p.y - 8);
  ctx.restore();
}

export function drawScene(ctx, s) {
  const t = s.transform;
  ctx.clearRect(0, 0, s.viewW, s.viewH);
  if (s.background) ctx.drawImage(s.background, t.offX, t.offY, t.dispW, t.dispH);
  if (s.ghost) {
    ctx.globalAlpha = s.ghost.opacity;
    ctx.drawImage(s.ghost.image, t.offX, t.offY, t.dispW, t.dispH);
    ctx.globalAlpha = 1;
    drawLines(ctx, t, s.ghost.lines, { ghost: true, handles: false });
  }
  ctx.save();
  if (s.gyro) {
    ctx.translate(s.viewW / 2, s.viewH / 2);
    ctx.rotate((-s.gyro.rollDeg * Math.PI) / 180);
    ctx.translate(-s.viewW / 2 + s.gyro.dx, -s.viewH / 2 + s.gyro.dy);
  }
  if (s.lines) drawLines(ctx, t, s.lines, { ghost: false, handles: !s.linesLocked });
  for (const c of COLOURS) {
    if (s.markers[c]) drawMarker(ctx, t, s.markers[c], c, s.ellipseWidth, s.selected === c);
  }
  if (s.crosshair) drawCrosshair(ctx, t, s.crosshair);
  ctx.restore();
}

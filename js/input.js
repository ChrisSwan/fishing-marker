// Pointer handling: distinguishes taps from drags and reports deltas in CSS pixels.
export const TAP_SLOP = 8;

export function attachInput(el, h) {
  let start = null;
  const pos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const p = pos(e);
    start = { x: p.x, y: p.y, moved: false, last: p };
    h.onDown?.(p.x, p.y);
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = pos(e);
    if (!start.moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) {
      start.moved = true;
      start.last = { x: start.x, y: start.y };
    }
    if (start.moved) {
      h.onDrag?.(p.x - start.last.x, p.y - start.last.y, p.x, p.y);
      start.last = p;
    }
  });
  el.addEventListener('pointerup', (e) => {
    if (!start) return;
    const p = pos(e);
    const wasTap = !start.moved;
    start = null;
    if (wasTap) h.onTap?.(p.x, p.y);
    else h.onDragEnd?.(p.x, p.y);
  });
  el.addEventListener('pointercancel', () => {
    start = null;
    h.onCancel?.();
  });
}

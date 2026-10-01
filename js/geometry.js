// Pure ratio maths (spec §8). All coordinates are image fractions 0–1.
export const MIN_BANK_GAP = 0.02;
export const MIN_ANCHOR_GAP = 0.05;

export function yAt(line, x) {
  const { p1, p2 } = line;
  if (p2.x === p1.x) return NaN;
  return p1.y + ((x - p1.x) / (p2.x - p1.x)) * (p2.y - p1.y);
}

export function toRatios(lines, pt) {
  const yN = yAt(lines.near, pt.x);
  const yF = yAt(lines.far, pt.x);
  return {
    r: (yN - pt.y) / (yN - yF),
    s: (pt.x - lines.anchorA.x) / (lines.anchorB.x - lines.anchorA.x),
  };
}

export function fromRatios(lines, { r, s }) {
  const x = lines.anchorA.x + s * (lines.anchorB.x - lines.anchorA.x);
  const yN = yAt(lines.near, x);
  return { x, y: yN - r * (yN - yAt(lines.far, x)) };
}

export function validateLines(lines) {
  const errors = [];
  for (const name of ['far', 'near']) {
    if (lines[name].p1.x === lines[name].p2.x) errors.push(`The ${name}-bank line can't be vertical.`);
  }
  if (Math.abs(lines.anchorB.x - lines.anchorA.x) < MIN_ANCHOR_GAP) errors.push('Anchors A and B are too close together.');
  if (!errors.length) {
    for (const x of [lines.anchorA.x, lines.anchorB.x, 0.5]) {
      if (yAt(lines.near, x) - yAt(lines.far, x) <= MIN_BANK_GAP) {
        errors.push('The near-bank line must sit clearly below the far-bank line.');
        break;
      }
    }
  }
  return errors;
}

export function checkPoint(lines, pt) {
  const errors = validateLines(lines);
  if (!errors.length && yAt(lines.near, pt.x) - yAt(lines.far, pt.x) <= MIN_BANK_GAP) {
    errors.push('The near-bank line must sit clearly below the far-bank line here.');
  }
  if (errors.length) return { ok: false, errors, warnings: [] };
  const { r, s } = toRatios(lines, pt);
  const warnings = [];
  if (r < 0 || r > 1) warnings.push('This spot is outside the bank lines.');
  if (s < -0.5 || s > 1.5) warnings.push('This spot is a long way from both anchor trees.');
  return { ok: true, r, s, errors: [], warnings };
}

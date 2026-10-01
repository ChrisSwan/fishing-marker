// Tiny test harness that runs unchanged in Node and in the browser. No dependencies.
const registry = [];

export function test(name, fn) {
  registry.push({ name, fn });
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`.trim());
}

export function assertClose(actual, expected, eps = 1e-9, msg = '') {
  if (!(Math.abs(actual - expected) <= eps)) throw new Error(`${msg} expected ${expected} ±${eps}, got ${actual}`.trim());
}

export function assertTrue(value, msg = 'expected a truthy value') {
  if (!value) throw new Error(msg);
}

export async function runAll() {
  const results = [];
  for (const t of registry) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err?.message ?? String(err) });
    }
  }
  return results;
}

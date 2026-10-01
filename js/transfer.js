// Export via the share sheet (falling back to download) and import via the file picker (spec §7).
import { validateSwim } from './storage.js';

export function exportFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `fishing-marker-swim-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

export function serializeSwim(swim) {
  return JSON.stringify(swim, null, 2);
}

export function parseImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Fishing Marker swim (not valid JSON)." };
  }
  const v = validateSwim(obj);
  if (!v.ok) return { ok: false, error: `That file isn't a usable swim: ${v.error}` };
  return { ok: true, swim: obj };
}

export async function exportText(text, filename, env = { nav: globalThis.navigator, doc: globalThis.document }) {
  const { nav, doc } = env;
  const attempts = [
    new File([text], filename, { type: 'application/json' }),
    new File([text], filename.replace(/\.json$/, '.txt'), { type: 'text/plain' }),
  ];
  for (const file of attempts) {
    if (!nav?.canShare?.({ files: [file] })) continue;
    try {
      await nav.share({ files: [file], title: 'Fishing Marker swim' });
      return file.type === 'application/json' ? 'shared' : 'shared-txt';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  const timer = setTimeout(() => URL.revokeObjectURL(url), 10000);
  timer?.unref?.();
  return 'downloaded';
}

export function pickTextFile(doc = globalThis.document) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json,text/plain';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// App state and DOM wiring. All maths lives in the pure modules.
import { VERSION } from './version.js';
import { coverTransform, screenToImage } from './viewport.js';
import { openSwimStore, defaultLines } from './storage.js';
import { confirmLines, placeMarker, deleteMarker, addMeasurement, markerPositions } from './swim.js';
import { drawScene, hitTest, dragLines } from './overlay.js';
import { attachInput } from './input.js';
import { startCamera, cameraErrorMessage, captureFrame, frameToJpeg, loadImage } from './camera.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    const fail = () => { throw new Error('unavailable'); };
    return { getItem: fail, setItem: fail };
  }
}

const store = openSwimStore(safeLocalStorage());
const state = {
  swim: store.swim,
  frozen: false,
  frame: null,
  lines: null,              // working lines while frozen; null in live view
  linesConfirmed: false,
  sessionConfirmed: false,  // lines confirmed at least once since the app opened
  newReference: false,
  showGhost: false,
  ghostImage: null,
  tool: 'marker',           // 'marker' | 'measure'
  colour: 'blue',
  selected: null,
  drag: null,               // {type:'marker', colour, pos} | {type:'lines', hit}
  crosshair: null,
  pose: null,
  freezePose: null,
  poseBase: null,
  gyroSeen: false,
  viewW: 0,
  viewH: 0,
};

let statusTimer;
function say(text, ms = 4000) {
  $('status').textContent = text;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { $('status').textContent = ''; }, ms);
}

function commit(nextSwim) {
  state.swim = nextSwim;
  const res = store.save(nextSwim);
  if (!res.ok) say(res.error, 0);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.viewW = r.width;
  state.viewH = r.height;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function transform() {
  const w = state.frozen ? state.frame.width : video.videoWidth;
  const h = state.frozen ? state.frame.height : video.videoHeight;
  if (!w || !h || !state.viewW) return null;
  return coverTransform(w, h, state.viewW, state.viewH);
}

function activeLines() {
  return state.lines ?? state.swim.currentLines ?? state.swim.reference?.lines ?? null;
}

// Replaced in Task 8 (gyro). Returns {dx, dy, rollDeg} or null.
function liveOverlay() {
  return null;
}

function render() {
  const t = transform();
  if (!t) { ctx.clearRect(0, 0, state.viewW, state.viewH); updateToolbar(); return; }
  const lines = activeLines();
  const markers = markerPositions(state.swim, lines);
  if (state.drag?.type === 'marker') markers[state.drag.colour] = state.drag.pos;
  drawScene(ctx, {
    viewW: state.viewW,
    viewH: state.viewH,
    transform: t,
    background: state.frozen ? state.frame : null,
    ghost: state.frozen && state.showGhost && state.ghostImage && state.swim.reference
      ? { image: state.ghostImage, lines: state.swim.reference.lines, opacity: state.swim.settings.ghostOpacity }
      : null,
    lines,
    linesLocked: !state.frozen || state.linesConfirmed,
    markers,
    selected: state.selected,
    ellipseWidth: state.swim.settings.ellipseWidth,
    crosshair: state.crosshair,
    gyro: state.frozen ? null : liveOverlay(),
  });
  updateToolbar();
}

function loop() {
  if (state.frozen) return;
  render();
  requestAnimationFrame(loop);
}

function updateToolbar() {
  $('btn-freeze').textContent = state.frozen ? 'Live' : 'Freeze';
  $('btn-confirm').hidden = !(state.frozen && !state.linesConfirmed);
  $('btn-lock').hidden = !(state.frozen && state.linesConfirmed);
  $('btn-ghost').hidden = !(state.frozen && state.ghostImage);
  $('btn-ghost').classList.toggle('active', state.showGhost);
  $('btn-measure').classList.toggle('active', state.tool === 'measure');
  $('btn-delete').hidden = !(state.frozen && state.selected && state.swim.markers[state.selected]);
  for (const chip of document.querySelectorAll('.chip')) {
    chip.classList.toggle('active', state.tool === 'marker' && chip.dataset.colour === state.colour);
  }
  $('badge').textContent = state.frozen ? 'FROZEN'
    : !state.sessionConfirmed ? 'LIVE — freeze to align'
    : !state.gyroSeen ? 'LIVE (no gyro)'
    : !state.poseBase ? 'LIVE — freeze to align'
    : 'LIVE ≈';
}

function freeze() {
  if (!video.videoWidth) { say('Camera not ready yet.'); return; }
  state.frame = captureFrame(video);
  state.freezePose = state.pose;
  state.frozen = true;
  state.crosshair = null;
  state.selected = null;
  const ref = state.swim.reference;
  if (!ref || state.newReference) {
    state.lines = structuredClone(state.swim.currentLines ?? defaultLines());
    state.linesConfirmed = false;
    state.showGhost = false;
    say(ref ? 'New reference: align the lines, then Confirm.' : 'Drag the lines onto the waterlines and two far-bank trees, then Confirm.', 0);
  } else if (state.sessionConfirmed) {
    state.lines = structuredClone(state.swim.currentLines);
    state.linesConfirmed = true;
    state.showGhost = false;
  } else {
    state.lines = structuredClone(ref.lines);
    state.linesConfirmed = false;
    state.showGhost = true;
    say('Match the lines to the ghost, then Confirm.', 0);
  }
  render();
}

function unfreeze() {
  if (state.frozen && !state.linesConfirmed) say('Lines not confirmed — alignment discarded.');
  state.frozen = false;
  state.frame = null;
  state.lines = null;
  state.drag = null;
  state.crosshair = null;
  state.selected = null;
  state.poseBase = state.sessionConfirmed ? state.freezePose : null;
  loop();
}

async function confirmAlignment() {
  const needRef = !state.swim.reference || state.newReference;
  const image = needRef ? frameToJpeg(state.frame) : null;
  const { swim, errors } = confirmLines(state.swim, state.lines, image);
  if (errors.length) { say(errors.join(' '), 6000); return; }
  commit(swim);
  if (needRef) state.ghostImage = await loadImage(image);
  state.linesConfirmed = true;
  state.sessionConfirmed = true;
  state.newReference = false;
  state.showGhost = false;
  say('Lines confirmed. Tap the water to place the selected colour.');
  render();
}

function sceneForHit() {
  const t = transform();
  if (!t) return null;
  return {
    transform: t,
    lines: state.lines,
    linesLocked: state.linesConfirmed,
    markers: markerPositions(state.swim, activeLines()),
    ellipseWidth: state.swim.settings.ellipseWidth,
  };
}

function report(result) {
  if (!result.ok) say(result.errors.join(' '), 6000);
  else if (result.warnings.length) say(result.warnings.join(' '));
}

attachInput(canvas, {
  onDown(sx, sy) {
    if (!state.frozen) return;
    const scene = sceneForHit();
    if (!scene) return;
    const hit = hitTest(scene, sx, sy);
    if (hit?.type === 'marker') {
      state.selected = hit.colour;
      state.colour = hit.colour;
      state.tool = 'marker';
      state.drag = state.linesConfirmed ? { type: 'marker', colour: hit.colour, pos: { ...scene.markers[hit.colour] } } : null;
    } else if (hit) {
      state.drag = { type: 'lines', hit };
    } else {
      state.drag = null;
    }
    render();
  },
  onDrag(dx, dy) {
    const t = transform();
    if (!state.drag || !t) return;
    const d = { dx: dx / t.dispW, dy: dy / t.dispH };
    if (state.drag.type === 'marker') state.drag.pos = { x: state.drag.pos.x + d.dx, y: state.drag.pos.y + d.dy };
    else state.lines = dragLines(state.lines, state.drag.hit, d);
    render();
  },
  onDragEnd() {
    const drag = state.drag;
    state.drag = null;
    if (drag?.type === 'marker') {
      const { swim, result } = placeMarker(state.swim, drag.colour, drag.pos);
      if (result.ok) commit(swim);
      report(result);
    }
    render();
  },
  onTap(sx, sy) {
    state.drag = null;
    if (!state.frozen) { say('Tap Freeze first.'); return; }
    const scene = sceneForHit();
    if (!scene) return;
    if (hitTest(scene, sx, sy)?.type === 'marker') { render(); return; }
    if (!state.linesConfirmed) { say('Confirm the lines first.'); return; }
    const pt = screenToImage(scene.transform, sx, sy);
    if (state.tool === 'measure') {
      const { swim, result } = addMeasurement(state.swim, pt);
      report(result);
      if (!result.ok) return;
      commit(swim);
      state.crosshair = { x: pt.x, y: pt.y, label: `r ${result.r.toFixed(3)}  s ${result.s.toFixed(3)}` };
      say(`Measured r ${result.r.toFixed(3)}, s ${result.s.toFixed(3)} (${swim.measurements.length} in log)`, 0);
    } else {
      const { swim, result } = placeMarker(state.swim, state.colour, pt);
      report(result);
      if (!result.ok) return;
      commit(swim);
      state.selected = state.colour;
    }
    render();
  },
  onCancel() {
    state.drag = null;
    render();
  },
});

$('btn-freeze').onclick = () => (state.frozen ? unfreeze() : freeze());
$('btn-confirm').onclick = confirmAlignment;
$('btn-lock').onclick = () => {
  state.linesConfirmed = false;
  state.selected = null;
  say('Lines unlocked — adjust them, then Confirm.');
  render();
};
$('btn-ghost').onclick = () => { state.showGhost = !state.showGhost; render(); };
$('btn-measure').onclick = () => {
  state.tool = state.tool === 'measure' ? 'marker' : 'measure';
  state.crosshair = null;
  render();
};
for (const chip of document.querySelectorAll('.chip')) {
  chip.onclick = () => {
    state.tool = 'marker';
    state.colour = chip.dataset.colour;
    state.selected = state.swim.markers[state.colour] ? state.colour : null;
    state.crosshair = null;
    render();
  };
}
$('btn-delete').onclick = () => {
  if (!state.selected) return;
  const colour = state.selected;
  commit(deleteMarker(state.swim, colour));
  state.selected = null;
  say(`${colour[0].toUpperCase()}${colour.slice(1)} marker deleted.`);
  render();
};
// Replaced in Task 7 (menu).
$('btn-menu').onclick = () => say(`Fishing Marker ${VERSION} — menu coming in the next build.`);

async function init() {
  window.addEventListener('resize', resize);
  resize();
  if (state.swim.reference) state.ghostImage = await loadImage(state.swim.reference.image).catch(() => null);
  if (store.status === 'error') say(store.error, 0);
  video.addEventListener('loadedmetadata', render);
  try {
    await startCamera(video);
  } catch (err) {
    say(cameraErrorMessage(err), 0);
  }
  loop();
}

init();

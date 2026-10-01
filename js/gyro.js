// Device orientation -> camera pose -> approximate overlay shift for live view (spec §9).
// World frame: x east, y north, z up. Device frame: x right, y top of screen, z out of the screen.
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// W3C DeviceOrientation: R = Rz(alpha) · Rx(beta) · Ry(gamma)
export function rotationMatrix(alpha, beta, gamma) {
  const a = rad(alpha || 0), b = rad(beta || 0), g = rad(gamma || 0);
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  return [
    [cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB],
    [cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB],
    [-cB * sG, sB, cB * cG],
  ];
}

export function poseFromMatrix(R) {
  const f = [-R[0][2], -R[1][2], -R[2][2]]; // rear camera looks along device -z
  const up = [R[0][1], R[1][1], R[2][1]];   // device +y
  const right = [R[0][0], R[1][0], R[2][0]]; // device +x
  return {
    yaw: deg(Math.atan2(f[0], f[1])),
    pitch: deg(Math.asin(Math.max(-1, Math.min(1, f[2])))),
    roll: deg(Math.atan2(-right[2], up[2])),
  };
}

export function cameraPose({ alpha, beta, gamma }) {
  return poseFromMatrix(rotationMatrix(alpha, beta, gamma));
}

export function poseDelta(base, cur) {
  return { dYaw: wrap(cur.yaw - base.yaw), dPitch: cur.pitch - base.pitch, dRoll: wrap(cur.roll - base.roll) };
}

export function overlayTransform(delta, viewH, fovDegrees) {
  const k = viewH / fovDegrees;
  return { dx: -delta.dYaw * k, dy: delta.dPitch * k, rollDeg: delta.dRoll };
}

export function startGyro(onPose, win = globalThis.window) {
  const handler = (e) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    onPose(cameraPose(e));
  };
  win.addEventListener('deviceorientation', handler);
  return () => win.removeEventListener('deviceorientation', handler);
}

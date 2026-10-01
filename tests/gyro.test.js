import { test, assertClose, assertEqual } from './runner.js';
import { rotationMatrix, poseFromMatrix, cameraPose, poseDelta, overlayTransform } from '../js/gyro.js';

const rad = (d) => (d * Math.PI) / 180;
const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((sum, v, k) => sum + v * B[k][j], 0)));
const rotX = (d) => [[1, 0, 0], [0, Math.cos(rad(d)), -Math.sin(rad(d))], [0, Math.sin(rad(d)), Math.cos(rad(d))]];
const rotZ = (d) => [[Math.cos(rad(d)), -Math.sin(rad(d)), 0], [Math.sin(rad(d)), Math.cos(rad(d)), 0], [0, 0, 1]];

test('upright phone facing north: yaw 0, pitch 0, roll 0', () => {
  const p = cameraPose({ alpha: 0, beta: 90, gamma: 0 });
  assertClose(p.yaw, 0, 1e-9); assertClose(p.pitch, 0, 1e-9); assertClose(p.roll, 0, 1e-9);
});

test('alpha 90 turns the camera to yaw -90 (west)', () => {
  assertClose(cameraPose({ alpha: 90, beta: 90, gamma: 0 }).yaw, -90, 1e-9);
});

test('beta 80 points the camera 10° down', () => {
  assertClose(cameraPose({ alpha: 0, beta: 80, gamma: 0 }).pitch, -10, 1e-9);
});

test('rotationMatrix matches Rz·Rx·Ry for an arbitrary orientation', () => {
  const rotY = (d) => [[Math.cos(rad(d)), 0, Math.sin(rad(d))], [0, 1, 0], [-Math.sin(rad(d)), 0, Math.cos(rad(d))]];
  const expected = mul(mul(rotZ(30), rotX(70)), rotY(-15));
  const R = rotationMatrix(30, 70, -15);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assertClose(R[i][j], expected[i][j], 1e-12);
});

test('clockwise roll of an upright phone gives positive roll', () => {
  const R = mul(rotX(90), rotZ(-10));
  assertClose(poseFromMatrix(R).roll, 10, 1e-9);
});

test('poseDelta wraps yaw across ±180', () => {
  const d = poseDelta({ yaw: 170, pitch: 0, roll: 0 }, { yaw: -170, pitch: 2, roll: -1 });
  assertClose(d.dYaw, 20); assertClose(d.dPitch, 2); assertClose(d.dRoll, -1);
});

test('overlayTransform: turning right moves content left; tilting up moves it down', () => {
  const o = overlayTransform({ dYaw: 1, dPitch: 2, dRoll: 3 }, 650, 65);
  assertEqual([o.dx, o.dy, o.rollDeg], [-10, 20, 3]);
});

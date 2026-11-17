// The three tilt icons of VPL3 from the raw accelerometer of the Thymio 3. Pure: no import of the browser, Node tests it.
//
// Measured on a real robot (2026-11-17, see tests/tilt.test.js): imu.get_acc() has x BACKWARD, y to the RIGHT, z up (z = +16384 flat, 1 g).
// The page turns it into the robot's own axes: xf forward, yl left, zu up (`cfg.flip`).
//
//   pitch (side view)         atan2(-xf, sgn(zu) * sqrt(yl^2 + zu^2))   -180..+180, < 0 front RAISED, > 0 front lowered. The sqrt keeps the
//                                                              roll out of it (the Thymio 2 formula atan2(-xf, zu) is not); the sign of zu lets it go all
//                                                              the way round. Meaningless when the robot lies on a side (p small: its side view is a line)
//   roll  (front view)        atan2(-yl, zu)                  -180..+180, > 0 left side lowered; meaningless when the robot stands on its
//                                                              tail or its nose (q small)
//   v     (top view, upright) atan2(yl, xf)                   -180..+180, 0 standing on the tail (front up), +90 on the right side, 180 on
//                                                              the nose, clockwise on the picture; meaningless when the robot is flat (r small)
//
// The decoupled pitch is what removes the interaction of the two angles of the Thymio 2 formula atan2(x, z) (see the notes in README.md).

import { G } from './spec.js';

export const DEFAULT_CFG = Object.freeze({
  flip: true,            // the real sensor frame is turned by half a turn (x backward, y right)
  rMin: 0.3,             // v is shown when the part of gravity in the robot's plane (xf, yl) is at least this
  qMin: 0.3,             // roll is shown when the part of gravity in the (yl, zu) plane is at least this (pitch below ~72 degrees)
  pMin: 0.3,             // pitch is shown when the part of gravity in the (xf, zu) plane is at least this (not lying on a side)
  hyst: 0,               // degrees added to the 7.5 degree half-window before the step changes
  smooth: 3,             // readings averaged (the page is told ten times a second)
  signPitch: 1, signRoll: 1, signV: 1,
  step: 15,
});

export const DEFAULT_CAL = Object.freeze({ x0: 0, y0: 0, zs: 1 });

const RAD = 180 / Math.PI;
const hyp = (...v) => Math.sqrt(v.reduce((s, a) => s + a * a, 0));

export const wrap180 = (a) => { let r = (a + 180) % 360; if (r < 0) r += 360; return r - 180; };

// The robot's axes (forward, left, up), the offsets of the flat calibration removed.
export function axes(acc, cal = DEFAULT_CAL, cfg = DEFAULT_CFG) {
  let xc = acc.x - cal.x0;
  let yc = acc.y - cal.y0;
  if (cfg.flip) { xc = -xc; yc = -yc; }
  return { xf: xc, yl: yc, zu: (cal.zs || 1) * acc.z };
}

// Everything the three icons need for one reading. Angles in degrees (not rounded).
export function angles(acc, cal = DEFAULT_CAL, cfg = DEFAULT_CFG) {
  const { xf, yl, zu } = axes(acc, cal, cfg);
  const g = hyp(xf, yl, zu);
  const r = g < 1 ? 0 : hyp(xf, yl) / g;               // share of gravity in the robot's plane: 0 flat, 1 standing
  const q = g < 1 ? 0 : hyp(yl, zu) / g;               // share in the (left, up) plane: 0 on the tail or the nose
  const p = g < 1 ? 0 : hyp(xf, zu) / g;               // share in the (forward, up) plane: 0 lying on a side
  return {
    xf, yl, zu, g, r, q, p,
    pitch: cfg.signPitch * Math.atan2(-xf, (zu < 0 ? -1 : 1) * hyp(yl, zu)) * RAD,
    roll: cfg.signRoll * Math.atan2(-yl, zu) * RAD,
    v: cfg.signV * Math.atan2(yl, xf) * RAD,
    t2pitch: cfg.signPitch * Math.atan2(-xf, zu) * RAD,       // the Thymio 2 formula, for comparison
    validPitch: p >= cfg.pMin,
    validRoll: q >= cfg.qMin,
    validV: r >= cfg.rMin,
  };
}

// The step (multiple of `step` degrees) an angle is in, limited to [lo, hi].
export function stepOf(angle, step = 15, lo = -180, hi = 180) {
  const s = Math.round(angle / step) * step;
  return Math.max(lo, Math.min(hi, s)) + 0;            // (+ 0: no -0)
}

// A step with a margin: it changes only when the angle is more than half a step + `hyst` degrees from the current one. `wrapAround` for angles
// that turn all the way round (roll, v): 180 and -180 are the same step.
export class StepTracker {
  constructor({ step = 15, hyst = 0, lo = -180, hi = 180, wrapAround = false } = {}) {
    Object.assign(this, { step, hyst, lo, hi, wrapAround });
    this.current = null;
  }

  update(angle, hyst = this.hyst) {
    const next = stepOf(angle, this.step, this.lo, this.hi);
    if (this.current == null) { this.current = next; return next; }
    const d = this.wrapAround ? wrap180(angle - this.current) : angle - this.current;
    if (Math.abs(d) > this.step / 2 + hyst) this.current = next;
    return this.current;
  }

  reset() { this.current = null; }
}

// Same step (the dial of a circle: -180 and 180 are one tick).
export const sameStep = (a, b) => a != null && b != null && (a === b || Math.abs(wrap180(a - b)) < 0.01);

// A moving average of the last `n` readings.
export class Smoother {
  constructor() { this.list = []; }
  push(a, n = 3) {
    this.list.push(a);
    while (this.list.length > Math.max(1, n)) this.list.shift();
    const k = this.list.length;
    const s = this.list.reduce((t, r) => ({ x: t.x + r.x, y: t.y + r.y, z: t.z + r.z }), { x: 0, y: 0, z: 0 });
    return { x: s.x / k, y: s.y / k, z: s.z / k };
  }

  clear() { this.list = []; }
}

// The flat calibration from a few readings: the offsets of x and y, and the sign of z. Returns { cal } or { error }.
export function calibrateFlat(list, cfg = DEFAULT_CFG) {
  if (!list.length) return { error: 'empty' };
  const m = list.reduce((t, r) => ({ x: t.x + r.x, y: t.y + r.y, z: t.z + r.z }), { x: 0, y: 0, z: 0 });
  const k = list.length;
  const mean = { x: m.x / k, y: m.y / k, z: m.z / k };
  const g = hyp(mean.x, mean.y, mean.z);
  if (Math.abs(mean.z) < 0.9 * g || g < 0.8 * G || g > 1.2 * G) return { error: 'notflat', mean };
  for (const r of list) if (Math.abs(r.x - mean.x) > 1500 || Math.abs(r.y - mean.y) > 1500) return { error: 'moving', mean };
  return { cal: { x0: Math.round(mean.x), y0: Math.round(mean.y), zs: mean.z >= 0 ? 1 : -1 }, mean };
}

// The raw reading of a robot at (pitch, roll) (what a virtual robot says): the pitch turns the robot all the way round its lateral axis, the roll
// tilts what is left of the plane (left, up). Past 90 degrees of pitch the roll reads half a turn more (the same pose has two names).
export function poseToAcc(pitch, roll, cal = DEFAULT_CAL, cfg = DEFAULT_CFG) {
  const p = (pitch / cfg.signPitch) / RAD;
  const r = (roll / cfg.signRoll) / RAD;
  const xf = -G * Math.sin(p);
  const yl = -G * Math.cos(p) * Math.sin(r);
  const zu = G * Math.cos(p) * Math.cos(r);
  const sx = cfg.flip ? -1 : 1;
  return { x: Math.round(sx * xf + cal.x0), y: Math.round(sx * yl + cal.y0), z: Math.round(zu * (cal.zs || 1)) };
}

// Poses of the simulator and of the measurements: [label, pitch, roll]
export const POSES = [
  ['À plat', 0, 0],
  ['Avant levé 45°', -45, 0],
  ['Côté gauche bas 45°', 0, 45],
  ['À l’envers', 0, 180],
  ['Debout sur la queue', -90, 0],
  ['Debout, côté droit', 0, -90],
  ['Debout sur le nez', 90, 0],
  ['Debout, côté gauche', 0, 90],
];

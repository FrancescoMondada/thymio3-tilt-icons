import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { angles, StepTracker, stepOf, calibrateFlat, poseToAcc, Smoother, wrap180, DEFAULT_CFG } from '../src/tilt.js';
import { LineAssembler, parseRobotLine } from '../src/protocol.js';
import { runArgs } from '../src/spec.js';
import { pythonCode, activityRules } from '../src/codegen.js';

// The guided measurement of 2026-11-17 on a real Thymio 3 (tilt_test3.py): raw imu.get_acc() of each pose and what its table printed
// (pitch, roll, v, r in %). The flat calibration of that run: x0 = 278, y0 = 356, z positive.
const CAL = { x0: 278, y0: 356, zs: 1 };
const REAL = [
  // [raw x, y, z, pitch, roll, v, r%]   (pitch 'D' = decoupled)
  [-12925, 217, 9876, -53, -1, 1, 80],
  [11917, 588, 11195, 46, 1, -179, 72],
  [-1256, 12289, 10740, -5, 48, -83, 74],
  [492, -11711, 10986, 1, -48, 91, 73],
  [-10729, 9488, 7908, -42, 49, -40, 87],
  [481, 105, -16525, 1, -179, 129, 1],
  [-16198, 197, 925, -87, -10, 1, 99],
  [526, -16050, 380, 1, -89, 91, 99],
  [16807, 274, 90, 90, -42, 180, 99],
  [437, 16581, -135, 1, 90, -91, 99],
  [-11099, -11574, 672, -44, -87, 46, 99],
  [-10404, 12745, 179, -41, 89, -49, 99],
  [13078, -10098, 228, 51, -89, 141, 99],
  [-5390, 279, 15254, -20, 0, 1, 34],
];

test('the page computes what the measured table printed (within a degree)', () => {
  for (const [x, y, z, p, r, v, rr] of REAL) {
    const a = angles({ x, y, z }, CAL);
    if (a.validPitch) {        // (lying on a side the pitch has no meaning: the sign of z's noise would flip it)
      // upside down the measured table (made with the +-90 pitch) said 0; the pitch now goes all the way round: 180
      const want = z < -10000 ? 180 : p;
      assert.ok(Math.abs(wrap180(a.pitch - want)) <= 1.01, `pitch ${a.pitch} vs ${want} for ${x},${y},${z}`);
    }
    assert.ok(Math.abs(wrap180(a.roll - r)) <= 1.01 || a.q < 0.35, `roll ${a.roll} vs ${r}`);
    assert.ok(Math.abs(wrap180(a.v - v)) <= 1.01 || a.r < 0.05, `v ${a.v} vs ${v} for ${x},${y},${z}`);
    assert.ok(Math.abs(a.r * 100 - rr) <= 1.5, `r ${a.r * 100} vs ${rr}`);
  }
});

test('the Thymio 2 pitch formula is coupled with the roll; the decoupled one is not', () => {
  const a = angles({ x: -10729, y: 9488, z: 7908 }, CAL);       // front raised 42, left lowered
  assert.ok(Math.abs(a.pitch + 42) < 1 && Math.abs(a.t2pitch + 54) < 1);
  const up = angles({ x: 481, y: 105, z: -16525 }, CAL);         // upside down
  assert.ok(Math.abs(Math.abs(up.pitch) - 180) < 2 && Math.abs(Math.abs(up.t2pitch) - 180) < 2);   // both go round upside down
  // the difference is in the roll's grip: rolled 150 degrees and front raised 30, the Thymio 2 formula shows the roll in the pitch
  const raised = angles(poseToAcc(-30, 0));
  const rolled = angles(poseToAcc(-30, 60));
  assert.ok(Math.abs(raised.pitch + 30) < 0.1 && Math.abs(rolled.pitch + 30) < 0.1);
  assert.ok(Math.abs(rolled.t2pitch + 30) > 15);
});

test('validity: v is shown only when upright, roll only when not on the tail or the nose', () => {
  assert.equal(angles({ x: 278, y: 356, z: 16194 }, CAL).validV, false);          // flat
  assert.equal(angles({ x: 526, y: -16050, z: 380 }, CAL).validV, true);           // upright
  assert.equal(angles({ x: 437, y: 16581, z: -135 }, CAL).validPitch, false);       // lying on a side
  assert.equal(angles({ x: -16198, y: 197, z: 925 }, CAL).validPitch, true);        // on the tail: the pitch says so (-90)
  assert.equal(angles({ x: -16198, y: 197, z: 925 }, CAL).validRoll, false);       // on the tail
  assert.equal(angles({ x: 278, y: 356, z: 16194 }, CAL).validRoll, true);
});

test('poseToAcc is the inverse of the formulas, in every pose', () => {
  for (const [pitch, roll] of [[0, 0], [-45, 0], [0, 45], [30, -60], [-20, 80], [-90, 0], [90, 0], [-135, 0], [120, 30], [170, 0], [-170, 20]]) {
    const a = angles(poseToAcc(pitch, roll));
    if (a.p > 0.2) assert.ok(Math.abs(wrap180(a.pitch - pitch)) < 0.1, `pitch ${a.pitch} vs ${pitch} (roll ${roll})`);
    // past 90 degrees of pitch the same pose reads half a turn more of roll
    const want = Math.abs(pitch) > 90 ? roll + 180 : roll;
    if (a.q > 0.2) assert.ok(Math.abs(wrap180(a.roll - want)) < 0.1, `roll ${a.roll} vs ${want}`);
  }
  assert.ok(Math.abs(angles(poseToAcc(-90, 0)).v) < 0.1);                              // on the tail: 0
  assert.ok(Math.abs(angles(poseToAcc(0, -90)).v - 90) < 0.1);                         // right side: +90
  assert.ok(Math.abs(Math.abs(angles(poseToAcc(90, 0)).v) - 180) < 0.1);              // on the nose
  assert.ok(Math.abs(angles(poseToAcc(0, 90)).v + 90) < 0.1);                          // left side: -90
});

test('steps of 15 degrees, and the margin that keeps a step', () => {
  assert.equal(stepOf(7.4), 0);
  assert.equal(stepOf(7.6), 15);
  assert.equal(stepOf(-100, 15, -90, 90), -90);
  const t = new StepTracker({ hyst: 3 });
  assert.equal(t.update(14), 15);
  assert.equal(t.update(7.6), 15);          // would be 15 anyway
  assert.equal(t.update(5), 15);            // 10 from 15 > 7.5, but not > 7.5 + 3? 10 > 10.5 is false: kept
  assert.equal(t.update(4), 0);             // 11 > 10.5: it moves
  const w = new StepTracker({ wrapAround: true });
  assert.equal(w.update(179), 180);
  assert.equal(w.update(-179), 180);         // across the seam: still the same tick (180 is -180)
});

test('flat calibration: the offsets, the sign of z, and what it refuses', () => {
  const ok = calibrateFlat([{ x: 300, y: 350, z: 16150 }, { x: 290, y: 360, z: 16170 }]);
  assert.deepEqual(ok.cal, { x0: 295, y0: 355, zs: 1 });
  assert.equal(calibrateFlat([{ x: 11000, y: 0, z: 11000 }]).error, 'notflat');
  assert.equal(calibrateFlat([{ x: 0, y: 0, z: 16000 }, { x: 4000, y: 0, z: 16000 }]).error, 'moving');
  assert.equal(calibrateFlat([{ x: 0, y: 0, z: -16300 }]).cal.zs, -1);
});

test('the smoother averages the last readings', () => {
  const s = new Smoother();
  s.push({ x: 0, y: 0, z: 0 }, 2);
  assert.deepEqual(s.push({ x: 10, y: 20, z: 30 }, 2), { x: 5, y: 10, z: 15 });
  assert.deepEqual(s.push({ x: 20, y: 20, z: 30 }, 2), { x: 15, y: 20, z: 30 });
});

test('the words of the robot', () => {
  const l = new LineAssembler();
  assert.deepEqual(l.push('@@a 1200 -10 2'), []);
  assert.deepEqual(l.push('0 16000' + ' '.repeat(40) + '\x1e@@hel'), ['@@a 1200 -10 20 16000' + ' '.repeat(40)]);
  assert.deepEqual(parseRobotLine('@@a 1200 -10 20 16000   '), { type: 'a', ms: 1200, x: -10, y: 20, z: 16000 });
  assert.equal(parseRobotLine('@@a 1 2 3'), null);
  assert.deepEqual(parseRobotLine('@@bat 3900'), { type: 'battery', volts: 3.9 });
  assert.equal(parseRobotLine('@@bye').type, 'bye');
  assert.equal(runArgs({}), '100');
  assert.equal(runArgs({ period: 10 }), '50');
});

test('the Python on the page computes what the page computes (angles, activity, steps), for several settings', () => {
  const rows = REAL.map(([x, y, z]) => [x, y, z]);
  // a few hundred poses of the simulator, with noise, from every direction
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 300; i++) rows.push([Math.round((rnd() * 2 - 1) * 17000), Math.round((rnd() * 2 - 1) * 17000), Math.round((rnd() * 2 - 1) * 17000)]);
  const settings = [
    [{}, { x0: 278, y0: 356, zs: 1 }],
    [{ flip: false, signPitch: -1, signRoll: -1, signV: -1, rMin: 0.5, qMin: 0.2, pMin: 0.4, hyst: 3 }, { x0: 0, y0: 0, zs: 1 }],
    [{ step: 30, smooth: 1 }, { x0: -100, y0: 50, zs: -1 }],
  ];
  for (const [over, cal] of settings) {
    const cfg = { ...DEFAULT_CFG, ...over };
    const code = pythonCode(cfg, cal, { loop: false });
    const harness = `${code}
import json
rows = json.loads(${JSON.stringify(JSON.stringify(rows))})
out = []
cur = [None, None, None]
for x, y, z in rows:
    t = tilt(x, y, z)
    steps = []
    for i in range(3):
        if t[3 + i]:
            cur[i] = next_step(cur[i], t[i])
        else:
            cur[i] = None
        steps.append(cur[i])
    out.append([t[0], t[1], t[2], t[3], t[4], t[5], steps])
print(json.dumps(out))
`;
    const got = JSON.parse(execFileSync('python3', ['-I', '-'], { input: harness }).toString());
    const trackers = [new StepTracker({ wrapAround: true, step: cfg.step, hyst: cfg.hyst }), new StepTracker({ wrapAround: true, step: cfg.step, hyst: cfg.hyst }), new StepTracker({ wrapAround: true, step: cfg.step, hyst: cfg.hyst })];
    rows.forEach(([x, y, z], k) => {
      const a = angles({ x, y, z }, cal, cfg);
      const [pitch, roll, v, okP, okR, okV, steps] = got[k];
      assert.ok(Math.abs(pitch - a.pitch) < 1e-6 && Math.abs(roll - a.roll) < 1e-6 && Math.abs(v - a.v) < 1e-6, `angles for ${x},${y},${z}`);
      assert.deepEqual([okP, okR, okV], [a.validPitch, a.validRoll, a.validV], `activity for ${x},${y},${z}`);
      const want = [[a.pitch, a.validPitch], [a.roll, a.validRoll], [a.v, a.validV]].map(([ang, ok], i) => (ok ? trackers[i].update(ang, cfg.hyst) : (trackers[i].reset(), null)));
      assert.deepEqual(steps, want, `steps for ${x},${y},${z}`);
    });
  }
  const full = pythonCode(DEFAULT_CFG, { x0: 1, y0: 2, zs: 1 });
  assert.ok(full.startsWith('import thymio') && full.includes('imu.get_acc()') && full.includes('X0 = 1'));
  assert.match(activityRules(DEFAULT_CFG).v.text, /inactive si r < 0,3.*17°/);
});

// What the page and the robot's script (src/py/tilt_stream.py) agree on. Pure: no import of the browser, Node tests it.

export const G = 16384;                    // 1 g on the raw accelerometer of the Thymio 3 (imu.get_acc)
export const DEFAULT_PERIOD_MS = 100;      // the script says @@a ten times a second
export const PERIOD_LIMITS = [50, 500];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clampPeriod = (v) => clamp(Math.round(Number(v) || DEFAULT_PERIOD_MS), PERIOD_LIMITS[0], PERIOD_LIMITS[1]);

// The arguments of run(): the period of the stream in ms. (robot-backend-core.js calls this with the init of the start.)
export function runArgs(s = {}) {
  return `${clampPeriod(s.period)}`;
}

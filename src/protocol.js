// The words of the script that runs on the robot (src/py/tilt_stream.py). Pure helpers: no import of the browser, Node tests them.
//
//   @@hello 1          the script is running
//   @@a ms x y z       the raw accelerometer (imu.get_acc), every period (100 ms by default)
//   @@bat mV           the battery, once
//   @@bye              the script ends (stopped by the page, or an error)

// stdout arrives in BLE notifications cut anywhere: rebuild complete lines. A line ends with a newline, or with \x1e (record separator): the
// script pads its lines to 100 bytes and ends them that way so that the firmware sends them at once (see say() in the script).
export class LineAssembler {
  constructor() { this.rest = ''; }
  push(text) {
    const parts = (this.rest + text).split(/[\r\n\x1e]+/);
    this.rest = parts.pop();
    return parts.filter((l) => l.trim());
  }
}

const ints = (a, n) => a.slice(0, n).map(Number);
const finite = (a) => a.every(Number.isFinite);

// One line of stdout -> an event, or null for anything else.
export function parseRobotLine(line) {
  const l = line.trim();
  if (/^\w*(Error|Exception)\b/.test(l)) return { type: 'error', message: l };
  const m = /^@@(\w+)\s*(.*)$/.exec(l);
  if (!m) return null;
  const [, word, rest] = m;
  const a = rest.split(/\s+/).filter(Boolean);
  switch (word) {
    case 'hello': return { type: 'hello', version: Number(a[0]) || 1 };
    case 'bat': { const v = Number(a[0]); return { type: 'battery', volts: v > 100 ? v / 1000 : v }; }
    case 'a': {
      const v = ints(a, 4);
      return v.length === 4 && finite(v) ? { type: 'a', ms: v[0], x: v[1], y: v[2], z: v[3] } : null;
    }
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}

// What the page knows about the robot, built from the events of a backend (robot or simulator). Plain JavaScript with no React: React reads it with
// useSyncExternalStore (see App.jsx) and Node can test it.

const fresh = () => ({
  version: 0,
  link: { status: 'idle', device: '', firmware: null, error: '' },
  running: false,                       // the script has said hello and not goodbye
  last: null,                           // { x, y, z, at }: the last raw reading
  list: [],                             // the last raw readings (newest last), for the smoothing and the calibration
  count: 0,                             // readings since the connection
  rate: 0,                              // readings per second, over the last two seconds
  battery: 0,
  error: '',
});

const KEEP = 40;

export class Telemetry {
  constructor() {
    this.s = fresh();
    this.listeners = new Set();
    this.times = [];
    this.subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
    this.getSnapshot = () => this.s;
  }

  set(patch) {
    this.s = { ...this.s, ...patch, version: this.s.version + 1 };
    for (const fn of this.listeners) fn();
  }

  clear() {
    const link = this.s.link;
    this.times = [];
    this.s = { ...fresh(), link, version: this.s.version + 1 };
    for (const fn of this.listeners) fn();
  }

  setLink(patch) { this.set({ link: { ...this.s.link, ...patch } }); }

  push(ev) {
    switch (ev.type) {
      case 'conn':
        this.setLink({ status: ev.status, device: ev.device ?? this.s.link.device, firmware: ev.firmware ?? this.s.link.firmware, error: ev.error || '' });
        if (ev.status === 'disconnected' || ev.status === 'reconnect') this.set({ running: false });
        break;
      case 'hello': this.set({ running: true, error: '' }); break;
      case 'bye': this.set({ running: false }); break;
      case 'script-ended': this.set({ running: false }); break;
      case 'battery': this.set({ battery: ev.volts }); break;
      case 'error': this.set({ error: ev.message }); break;
      case 'a': {
        const at = Date.now();           // (the backends stamp their events with performance.now(): the page compares with Date.now())
        this.times.push(at);
        while (this.times.length && at - this.times[0] > 2000) this.times.shift();
        const span = (at - this.times[0]) / 1000;
        const rate = this.times.length > 1 && span > 0 ? (this.times.length - 1) / span : 0;
        const r = { x: ev.x, y: ev.y, z: ev.z, at };
        this.set({ running: true, last: r, list: [...this.s.list.slice(-(KEEP - 1)), r], count: this.s.count + 1, rate });
        break;
      }
      default: break;
    }
  }
}

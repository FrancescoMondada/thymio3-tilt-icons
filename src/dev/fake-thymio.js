// A demonstration robot with the interface of thymio3-ts-api (used with `?fakerobot` in the address).
//
// It stands in for Web Bluetooth and the robot, so that the whole link (connection, module on the robot, launcher, stop) runs in a browser with
// no hardware: the same DOM events, the delays of the real link, the firmware's habits (stdout in batches, a Traceback when a script is stopped,
// the module kept in the robot's files). The stream script is played here in JavaScript: it says @@a with the reading of `window.fakeRobot.acc`.
//
// window.fakeRobot lets a test play the robot's side: pose(pitch, roll) (the model of tilt.js), acc, noise, flags, files.
import { poseToAcc } from '../tilt.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));
const bytes = (text) => new TextEncoder().encode(text).length;

const KEY = 'fakerobot.tilt.files';
const files = new Map();
try { for (const [k, v] of JSON.parse(localStorage.getItem(KEY) || '[]')) files.set(k, v); } catch { /* none */ }
if (!files.size) files.set('boot.py', '# boot\n'.padEnd(139, ' '));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...files])); } catch { /* private mode */ } };

let connected = false;
let ram = '';
let loaded = '';
let run = null;                             // the script that runs: { timer, kind }
const CAL = { x0: 278, y0: 356, zs: 1 };    // the sensor of the fake robot has the offsets of the real one
const state = { acc: poseToAcc(0, 0, CAL), noise: 120 };
const flags = { slow: 1, writeMs: 90, byteMs: 0.33 };

let pending = '';
let flushTimer = 0;
const flush = () => {
  clearTimeout(flushTimer);
  flushTimer = 0;
  while (pending.length) { fire('thymio-std-out-values', pending.slice(0, 240)); pending = pending.slice(240); }
};
const print = (text, padded) => {
  pending += text;
  if (padded || pending.length >= 100) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 1000);
};
const say = (line) => print(`${line}${' '.repeat(Math.max(0, 99 - line.length))}\x1e`, true);
const noisy = (v) => Math.round(v + (Math.random() * 2 - 1) * state.noise);

function stopRun(withTraceback) {
  if (!run) return;
  const r = run;
  run = null;
  clearInterval(r.timer);
  if (r.kind === 'test') { print('@@test done\r\n', true); setTimeout(() => fire('thymio-python-execution-status', false), 40); return; }
  say('@@bye');
  if (withTraceback) {
    setTimeout(() => print('Traceback (most recent call last):\r\n  File "mp_script", line 2, in <module>\r\n  File "tilt_fake.py", line 30, in run\r\nKeyboardInterrupt: \r\n', false), 300);
    setTimeout(() => flush(), 1300);
  }
  setTimeout(() => { if (!run) fire('thymio-python-execution-status', false); }, 120);
}

function startStream(period) {
  const r = { kind: 'mode', timer: 0 };
  run = r;
  setTimeout(() => {
    if (run !== r) return;
    say('@@hello 1');
    say('@@bat 3900');
    const t0 = Date.now();
    r.timer = setInterval(() => {
      const a = state.acc;
      say(`@@a ${Date.now() - t0} ${noisy(a.x)} ${noisy(a.y)} ${noisy(a.z)}`);
    }, period / flags.slow);
  }, 350);
}

const LAUNCHER = /^import (tilt_\w+)\s+\1\.run\((\d+)\)/m;
const WHOLE = /\nrun\((\d+)\)\s*$/;

function execute(script) {
  const launcher = LAUNCHER.exec(script);
  const whole = WHOLE.exec(script);
  if (launcher) {
    if (![...files.keys()].includes(`${launcher[1]}.py`)) {
      print(`Traceback (most recent call last):\r\n  File "mp_script", line 1, in <module>\r\nImportError: no module named '${launcher[1]}'\r\n`, true);
      setTimeout(() => fire('thymio-python-execution-status', false), 100);
      return;
    }
    startStream(Number(launcher[2]));
  } else if (whole && script.includes('def run(')) {
    startStream(Number(whole[1]));
  } else if (script.includes('@@test start')) {
    run = { kind: 'test', timer: 0 };
    print('@@test start\r\n', true);
    setTimeout(() => stopRun(false), 1500);
  } else {
    setTimeout(() => fire('thymio-python-execution-status', false), 50);
  }
}

// ---- the API ----------------------------------------------------------------------------------------------
export async function requestAndConnect() {
  await sleep(600);
  connected = true;
  fire('thymio-connected', true);
  fire('thymio-connected', true);                   // the real API says it twice
}
export const isConnected = () => connected;
export async function disconnect() {
  stopRun(false);
  connected = false;
  fire('thymio-connected', false);
}
export const getDeviceName = () => 'THYMIO3-FAKE';
export async function getFirmwareInfo() { await sleep(150); return { esp32_ver: '1.10.2', stm32_ver: 0 }; }
export async function stopSensorStreaming() { await sleep(40); }
export async function listFiles() { await sleep(80); return [...files].map(([name, text]) => ({ name, size: bytes(text) })); }
export async function uploadFile(file) { const text = await file.text(); await sleep(bytes(text) * flags.byteMs); ram = text; }
export async function saveFile(name) { await sleep(150); files.set(name, ram); persist(); }
export async function deleteFile(name) { files.delete(name); persist(); }
export async function freeMemory() { ram = ''; }
export async function sendPythonScript(text) {
  await sleep(40 + bytes(text) * flags.byteMs);
  loaded = text;
  fire('thymio-python-load-result', { success: true, code: 0, message: 'Script loaded successfully' });
  fire('thymio-python-execution-status', true);
}
export async function executeLoadedScript() {
  await sleep(100);
  if (run) return;
  execute(loaded);
}
export async function stopScriptExecution() {
  await sleep(60);
  if (run) stopRun(true);
}

if (typeof window !== 'undefined') {
  window.fakeRobot = {
    flags,
    get acc() { return state.acc; },
    set acc(v) { state.acc = v; },
    get noise() { return state.noise; },
    set noise(v) { state.noise = v; },
    pose(pitch, roll) { state.acc = poseToAcc(pitch, roll, CAL); },
    get files() { return [...files.keys()]; },
    get running() { return Boolean(run); },
    reset() { files.clear(); persist(); },
  };
}

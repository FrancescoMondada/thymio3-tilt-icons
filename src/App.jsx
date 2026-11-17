import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Dial from './components/Dial.jsx';
import { Readout, Simulator, Settings, CodePanel, Journal } from './components/Panels.jsx';
import { Telemetry } from './store.js';
import { RobotBackend } from './robot/robot-backend.js';
import { supportsBluetooth, isFakeRobot } from './api.js';
import { DEFAULT_CFG, DEFAULT_CAL, angles, StepTracker, calibrateFlat, poseToAcc } from './tilt.js';
import { DEFAULT_PERIOD_MS } from './spec.js';

const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

const SIM_CAL = { x0: 278, y0: 356, zs: 1 };       // the offsets of a real sensor (measured), so that the flat calibration has something to remove
const SIM_PERIOD = 100;

export default function App() {
  const [source, setSource] = useState('sim');                         // 'sim' | 'robot'
  const [cfg, setCfg] = useState(() => ({ ...DEFAULT_CFG, ...load('tilt.cfg', {}) }));
  const [cal, setCal] = useState(() => ({ ...DEFAULT_CAL, ...load('tilt.cal', {}) }));
  const [targets, setTargets] = useState(() => ({ roll: null, pitch: null, v: null, ...load('tilt.targets', {}) }));
  const [pose, setPose] = useState({ pitch: 0, roll: 0 });
  const [noise, setNoise] = useState(150);
  const [calMessage, setCalMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [log, setLog] = useState([]);
  const [now, setNow] = useState(Date.now());
  const bluetooth = supportsBluetooth();

  const tele = useRef(null);
  if (!tele.current) tele.current = new Telemetry();
  const snap = useSyncExternalStore(tele.current.subscribe, tele.current.getSnapshot);

  const robot = useRef(null);
  const sourceRef = useRef('sim');
  const started = useRef(false);
  const connecting = useRef(false);

  useEffect(() => { save('tilt.cfg', cfg); }, [cfg]);
  useEffect(() => { save('tilt.cal', cal); }, [cal]);
  useEffect(() => { save('tilt.targets', targets); }, [targets]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { document.title = 'Thymio · Icônes d’inclinaison'; }, []);

  // ---- the virtual robot: a reading every 100 ms from the pose --------------------------------------------
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const noiseRef = useRef(noise);
  noiseRef.current = noise;
  useEffect(() => {
    if (source !== 'sim') return undefined;
    const tick = () => {
      const a = poseToAcc(poseRef.current.pitch, poseRef.current.roll, SIM_CAL, DEFAULT_CFG);
      const n = () => (Math.random() * 2 - 1) * noiseRef.current;
      tele.current.push({ type: 'a', x: Math.round(a.x + n()), y: Math.round(a.y + n()), z: Math.round(a.z + n()), t: Date.now() });
    };
    tick();
    const timer = setInterval(tick, SIM_PERIOD);
    return () => clearInterval(timer);
  }, [source]);

  // ---- the real robot -------------------------------------------------------------------------------------
  const onLog = useCallback((kind, text) => setLog((l) => [...l.slice(-300), { at: Date.now(), kind, text }]), []);

  const startRobot = useCallback(() => {
    started.current = true;
    return robot.current.start({ period: DEFAULT_PERIOD_MS }).catch((err) => {
      started.current = false;
      tele.current.push({ type: 'error', message: err?.message || String(err) });
    });
  }, []);

  const backToSim = useCallback((reason = '') => {
    sourceRef.current = 'sim';
    setSource('sim');
    started.current = false;
    connecting.current = false;
    tele.current.clear();
    tele.current.setLink({ status: 'idle', device: '', firmware: null, error: '' });
    setNotice(reason);
  }, []);

  const onRobotEvent = useCallback((ev) => {
    if (sourceRef.current !== 'robot') return;
    tele.current.push(ev);
    if (ev.type === 'conn') {
      if (ev.status === 'connected' && !started.current) startRobot();
      if (ev.status === 'disconnected' || ev.status === 'reconnect') {
        started.current = false;
        if (connecting.current && ev.error) backToSim(ev.error);
      }
    }
  }, [backToSim, startRobot]);

  const connect = useCallback(async () => {
    if (!bluetooth) { setNotice('Ce navigateur n’a pas le Bluetooth web: essayez Chrome (ordinateur, Android) ou Bluefy (iPad, iPhone).'); return; }
    setNotice('');
    if (!robot.current) {
      robot.current = new RobotBackend((ev) => onRobotEvent(ev), { onLog });
      robot.current.attach();
    }
    sourceRef.current = 'robot';
    setSource('robot');
    started.current = false;
    connecting.current = true;
    tele.current.clear();
    tele.current.setLink({ status: 'connecting' });
    try { await robot.current.connect(); } finally { connecting.current = false; }
  }, [bluetooth, onLog, onRobotEvent]);

  const disconnect = useCallback(async () => {
    try { await robot.current?.disconnect(); } catch { /* ignore */ }
    backToSim('');
  }, [backToSim]);

  useEffect(() => {
    if (import.meta.env?.DEV) window.__tilt = { tele: tele.current, get robot() { return robot.current; } };
  }, []);

  // ---- from the raw reading to the three icons ----------------------------------------------------------------
  const trackers = useRef(null);
  if (!trackers.current) {
    trackers.current = {
      roll: new StepTracker({ wrapAround: true }),
      pitch: new StepTracker({ wrapAround: true }),
      v: new StepTracker({ wrapAround: true }),
    };
  }
  const stale = !snap.last || now - snap.last.at > 1500;
  const recent = snap.list.slice(-Math.max(1, cfg.smooth));
  let a = null;
  if (recent.length) {
    const m = recent.reduce((t, r) => ({ x: t.x + r.x, y: t.y + r.y, z: t.z + r.z }), { x: 0, y: 0, z: 0 });
    a = angles({ x: m.x / recent.length, y: m.y / recent.length, z: m.z / recent.length }, cal, cfg);
  }
  const live = a && !stale;
  const T = trackers.current;
  const steps = {
    roll: live && a.validRoll ? T.roll.update(a.roll, cfg.hyst) : (T.roll.reset(), null),
    pitch: live && a.validPitch ? T.pitch.update(a.pitch, cfg.hyst) : (T.pitch.reset(), null),
    v: live && a.validV ? T.v.update(a.v, cfg.hyst) : (T.v.reset(), null),
  };

  const patchCfg = useCallback((p) => setCfg((c) => ({ ...c, ...p })), []);
  const setTarget = (key) => (s) => setTargets((t) => ({ ...t, [key]: s }));
  const calibrate = useCallback(() => {
    const r = calibrateFlat(tele.current.getSnapshot().list.slice(-10), cfg);
    if (r.cal) { setCal(r.cal); setCalMessage(`Calibré: x₀ ${r.cal.x0}, y₀ ${r.cal.y0}, z ${r.cal.zs > 0 ? 'positif' : 'négatif'} à plat.`); }
    else setCalMessage(r.error === 'moving' ? 'Le robot bouge: tenez-le immobile et recommencez.' : r.error === 'notflat' ? 'Le robot n’est pas à plat (ou |g| n’est pas ≈ 1 g).' : 'Pas encore de mesure.');
  }, [cfg]);

  const linkText = source === 'sim' ? 'Simulation' : snap.link.status === 'connected' ? `${snap.link.device || 'Thymio 3'}${snap.running ? '' : ' · démarrage…'}` : snap.link.status === 'connecting' ? 'Connexion…' : 'Déconnecté';
  const why = {
    roll: a && !a.validRoll ? 'robot sur la queue ou le nez: roll non défini' : '',
    v: a && !a.validV ? 'robot à plat: angle debout non défini' : '',
    pitch: a && !a.validPitch ? 'robot sur le côté: pitch non défini' : '',
  };
  const waiting = source === 'robot' && !live ? (snap.link.status === 'connected' ? 'en attente du robot…' : 'robot non connecté') : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Icônes d’inclinaison</h1>
          <p>VPL3 · Thymio 3: roll, pitch et orientation debout en temps réel</p>
        </div>
        <div className="top-mid">
          <span className={`link ${source === 'robot' && snap.link.status === 'connected' ? 'on' : ''}`} role="status"><i aria-hidden="true" />{linkText}{isFakeRobot ? ' (faux robot)' : ''}</span>
          {source === 'robot'
            ? <button type="button" className="btn" onClick={disconnect}>Déconnecter</button>
            : <button type="button" className="btn primary" onClick={connect}>Connecter un robot</button>}
        </div>
      </header>
      {(notice || snap.error) && (
        <div className="banner" role="alert">
          <span>{notice || snap.error}</span>
          <button type="button" className="btn small" onClick={() => { setNotice(''); tele.current.set({ error: '' }); }}>Fermer</button>
        </div>
      )}
      <main className="stage">
        <div className="dials">
          <Dial title="Roll" hint="vue de face · côté gauche bas = +" view="front" angle={a?.roll} valid={Boolean(a?.validRoll)} stale={!live} step={steps.roll} target={targets.roll} onTarget={setTarget('roll')} why={waiting || why.roll} />
          <Dial title="Orientation debout" hint="vue de dessus · robot debout, sens horaire" view="top" angle={a?.v} valid={Boolean(a?.validV)} stale={!live} step={steps.v} target={targets.v} onTarget={setTarget('v')} why={waiting || why.v} />
          <Dial title="Pitch" hint="vue de côté · avant levé = −" view="side" angle={a?.pitch} valid={Boolean(a?.validPitch)} stale={!live} step={steps.pitch} target={targets.pitch} onTarget={setTarget('pitch')} why={waiting || why.pitch} />
        </div>
        <Readout snap={snap} a={a} stale={stale} cal={cal} />
        {source === 'sim' && <Simulator pose={pose} onPose={setPose} noise={noise} onNoise={setNoise} />}
        <Settings cfg={cfg} onCfg={patchCfg} onCalibrate={calibrate} onResetCal={() => { setCal({ ...DEFAULT_CAL }); setCalMessage('Calibration retirée.'); }} calMessage={calMessage} onDefaults={() => setCfg({ ...DEFAULT_CFG })} />
        <CodePanel cfg={cfg} cal={cal} />
        {source === 'robot' && <Journal log={log} onClear={() => setLog([])} />}
      </main>
    </div>
  );
}

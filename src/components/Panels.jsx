import React, { useMemo, useState } from 'react';
import { POSES } from '../tilt.js';
import { pythonCode, activityRules } from '../codegen.js';

const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));

// The numbers behind the dials: what the robot says (raw), what the page makes of it.
export function Readout({ snap, a, stale, cal }) {
  const last = snap.last;
  return (
    <section className="card readout" aria-label="Mesures">
      <h2>Mesures</h2>
      <dl>
        <div><dt>Brut x · y · z</dt><dd>{last ? `${last.x} · ${last.y} · ${last.z}` : '—'}</dd></div>
        <div><dt>Avant · gauche · haut</dt><dd>{a ? `${fmt(a.xf)} · ${fmt(a.yl)} · ${fmt(a.zu)}` : '—'}</dd></div>
        <div><dt>|g|</dt><dd>{a ? `${fmt((a.g / 16384) * 100)} %` : '—'}</dd></div>
        <div><dt>r (debout)</dt><dd>{a ? `${fmt(a.r * 100)} %` : '—'}</dd></div>
        <div><dt>q (roll)</dt><dd>{a ? `${fmt(a.q * 100)} %` : '—'}</dd></div>
        <div><dt>p (pitch)</dt><dd>{a ? `${fmt(a.p * 100)} %` : '—'}</dd></div>
        <div><dt>Pitch Thymio 2</dt><dd>{a ? `${fmt(a.t2pitch)}°` : '—'}</dd></div>
        <div><dt>Cadence</dt><dd>{snap.rate ? `${fmt(snap.rate, 1)} /s` : '—'}{stale && snap.count ? ' · plus de données' : ''}</dd></div>
        <div><dt>Calibration à plat</dt><dd>{cal.x0 === 0 && cal.y0 === 0 ? 'aucune' : `x₀ ${cal.x0} · y₀ ${cal.y0}`}</dd></div>
      </dl>
    </section>
  );
}

// The virtual robot: no hardware. Sliders for the two angles and the sensor noise, and the eight poses of the measurements.
export function Simulator({ pose, onPose, noise, onNoise }) {
  return (
    <section className="card sim" aria-label="Simulation">
      <h2>Simulation</h2>
      <p className="note">Pas de robot: on pose un robot virtuel. Pitch et roll décrivent comment il est tenu, le bruit imite la main.</p>
      <label>Pitch (avant levé &lt; 0) <output>{Math.round(pose.pitch)}°</output>
        <input type="range" min="-180" max="180" step="1" value={pose.pitch} onChange={(e) => onPose({ ...pose, pitch: Number(e.target.value) })} />
      </label>
      <label>Roll (côté gauche bas &gt; 0) <output>{Math.round(pose.roll)}°</output>
        <input type="range" min="-180" max="180" step="1" value={pose.roll} onChange={(e) => onPose({ ...pose, roll: Number(e.target.value) })} />
      </label>
      <label>Bruit du capteur <output>±{noise}</output>
        <input type="range" min="0" max="1500" step="50" value={noise} onChange={(e) => onNoise(Number(e.target.value))} />
      </label>
      <div className="chips">
        {POSES.map(([label, pitch, roll]) => (
          <button key={label} type="button" className="chip" onClick={() => onPose({ pitch, roll })}>{label}</button>
        ))}
      </div>
    </section>
  );
}

const Slider = ({ label, value, min, max, step, onChange, unit = '', help }) => (
  <label className="set">
    <span>{label} <output>{value}{unit}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    {help && <small>{help}</small>}
  </label>
);

// The choices that change what the icons do: thresholds, margin, signs. Everything is kept on the device.
export function Settings({ cfg, onCfg, onCalibrate, onResetCal, calMessage, onDefaults }) {
  const sign = (key, label) => (
    <label className="check"><input type="checkbox" checked={cfg[key] < 0} onChange={(e) => onCfg({ [key]: e.target.checked ? -1 : 1 })} />{label}</label>
  );
  return (
    <details className="card settings">
      <summary><h2>Réglages</h2></summary>
      <div className="grid">
        <Slider label="V valide si r ≥" value={cfg.rMin} min={0.05} max={0.9} step={0.05} onChange={(v) => onCfg({ rMin: v })} help="part de la gravité dans le plan du robot (0 = à plat, 1 = debout)" />
        <Slider label="Pitch valide si p ≥" value={cfg.pMin} min={0.05} max={0.9} step={0.05} onChange={(v) => onCfg({ pMin: v })} help="0,3 = jusqu’à 72° de roll (robot couché sur le côté: pitch non défini)" />
        <Slider label="Roll valide si q ≥" value={cfg.qMin} min={0.05} max={0.9} step={0.05} onChange={(v) => onCfg({ qMin: v })} help="0,3 = jusqu’à 72° de pitch" />
        <Slider label="Marge avant de changer de pas" value={cfg.hyst} min={0} max={6} step={0.5} unit="°" onChange={(v) => onCfg({ hyst: v })} help="s’ajoute aux ±7,5° du pas de 15°" />
        <Slider label="Lissage" value={cfg.smooth} min={1} max={10} step={1} unit=" mesures" onChange={(v) => onCfg({ smooth: v })} />
      </div>
      <div className="checks">
        <label className="check"><input type="checkbox" checked={cfg.flip} onChange={(e) => onCfg({ flip: e.target.checked })} />Repère du capteur retourné (x vers l’arrière, y vers la droite: mesuré)</label>
        {sign('signPitch', 'Inverser le sens du pitch')}
        {sign('signRoll', 'Inverser le sens du roll')}
        {sign('signV', 'Inverser le sens de l’angle debout')}
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={onCalibrate}>Calibrer à plat</button>
        <button type="button" className="btn" onClick={onResetCal}>Sans calibration</button>
        <button type="button" className="btn" onClick={onDefaults}>Réglages d’origine</button>
      </div>
      {calMessage && <p className="note" role="status">{calMessage}</p>}
      <p className="note">La calibration ne retire que les décalages de x et y (de l’ordre de 1°). Posez le robot à plat et ne le touchez pas.</p>
    </details>
  );
}

export function Journal({ log, onClear }) {
  return (
    <details className="card journal">
      <summary><h2>Journal de la liaison</h2></summary>
      <div className="row"><button type="button" className="btn small" onClick={onClear}>Effacer</button></div>
      <pre>{log.slice(-80).map((l) => `${new Date(l.at).toLocaleTimeString()} ${l.kind.padEnd(4)} ${l.text}`).join('\n') || '(vide)'}</pre>
    </details>
  );
}

// The code that computes what the page shows, from the page's settings, and when each icon is inactive. To paste in the ts-api demo and check
// on the robot that it says the same.
export function CodePanel({ cfg, cal }) {
  const code = useMemo(() => pythonCode(cfg, cal), [cfg, cal]);
  const rules = activityRules(cfg);
  const [copied, setCopied] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied('Copié.'); } catch { setCopied('Copie impossible: sélectionnez le code à la main.'); }
    setTimeout(() => setCopied(''), 3000);
  };
  return (
    <details className="card code" open>
      <summary><h2>Code Python (Thymio 3)</h2></summary>
      <p className="note">Calcule les trois angles et dit quand chaque icône est active, avec les réglages d’en haut (ils changent le code). Collé dans la démo ts-api, robot à plat au lancement, il doit afficher les mêmes angles que cette page.</p>
      <h3>Quand une icône est inactive</h3>
      <ul className="rules">
        <li><b>Pitch</b> {rules.pitch.text}.</li>
        <li><b>Roll</b> {rules.roll.text}.</li>
        <li><b>Orientation debout</b> {rules.v.text}.</li>
        <li>La page grise aussi les trois cadrans quand plus aucune mesure n’arrive (plus de 1,5 s).</li>
      </ul>
      <div className="row">
        <button type="button" className="btn" onClick={copy}>Copier le code</button>
        {copied && <span className="note" role="status">{copied}</span>}
      </div>
      <pre className="source" tabIndex={0}><code>{code}</code></pre>
    </details>
  );
}

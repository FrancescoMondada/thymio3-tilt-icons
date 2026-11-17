import React from 'react';
import { RobotFront, RobotTop, RobotSide } from './Robots.jsx';
import { sameStep } from '../tilt.js';

// One of the three icons as a live dial: the robot turns clockwise by the angle, gravity (the arrow) stays down, the 15 degree ticks around show
// which step is active, and a click on a tick sets the step the icon would be waiting for (a second click clears it).
const C = 120;
const R = 90;
const pos = (a, r = R) => ({ x: C + r * Math.sin((a * Math.PI) / 180), y: C - r * Math.cos((a * Math.PI) / 180) });
const VIEWS = { front: RobotFront, top: RobotTop, side: RobotSide };

export default function Dial({ title, hint, view, angle, valid, step, target, onTarget, half = false, stale = false, why = '' }) {
  const Robot = VIEWS[view];
  const ticks = [];
  const lo = half ? -90 : -165;
  const hi = half ? 90 : 180;
  for (let a = lo; a <= hi; a += 15) ticks.push(a);
  const shown = valid && !stale && angle != null;
  const turn = shown ? angle : 0;
  const fired = shown && target != null && sameStep(step, target);
  const needle = pos(angle ?? 0, R - 20);
  const label = (a) => (a === 0 || Math.abs(a) === 180 ? `${Math.abs(a)}` : a > 0 ? `+${a}` : `${a}`);

  return (
    <section className={`card dial ${shown ? '' : 'off'} ${fired ? 'fired' : ''}`} aria-label={title}>
      <header className="card-head">
        <h2>{title}</h2>
        <p>{hint}</p>
      </header>
      <svg viewBox="0 0 240 240" role="img" aria-label={`${title}: ${shown ? `${Math.round(angle)}°` : why || 'pas de mesure'}`}>
        <circle className="ring" cx={C} cy={C} r={R} />
        {ticks.map((a) => {
          const p = pos(a);
          const isStep = shown && sameStep(step, a);
          const isTarget = target != null && sameStep(target, a);
          return (
            <g
              key={a}
              className={`tick ${a === 0 ? 'zero' : ''} ${isStep ? 'step' : ''} ${isTarget ? 'target' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${isTarget ? 'Retirer' : 'Choisir'} le pas ${label(a)}°`}
              onClick={() => onTarget(isTarget ? null : a)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTarget(isTarget ? null : a); } }}
            >
              <circle className="hit" cx={p.x} cy={p.y} r="11" />
              <circle className="dot" cx={p.x} cy={p.y} r={isStep ? 7 : a % 45 === 0 ? 4 : 2.6} />
              {isTarget && <circle className="goal" cx={p.x} cy={p.y} r="11" />}
              {a % 90 === 0 && !isStep && <text x={pos(a, R + 20).x} y={pos(a, R + 20).y} textAnchor="middle" dominantBaseline="central">{label(a === -180 ? 180 : a)}</text>}
            </g>
          );
        })}
        {half && <path className="dead" d={`M${pos(-90).x} ${pos(-90).y} A${R} ${R} 0 0 0 ${pos(90).x} ${pos(90).y}`} />}
        {shown && <line className="needle" x1={C} y1={C} x2={needle.x} y2={needle.y} />}
        <g className="robot-turn" transform={`translate(${C} ${C}) rotate(${turn})`} style={{ opacity: shown ? 1 : 0.28 }}>
          <Robot />
        </g>
        <g className="gravity" aria-hidden="true">
          <line x1="28" y1="196" x2="28" y2="222" />
          <path d="M22 214L28 224L34 214" />
          <text x="38" y="216">g</text>
        </g>
      </svg>
      <div className="value" aria-live="off">
        <strong>{shown ? `${Math.round(angle) > 0 ? '+' : ''}${Math.round(angle)}°` : '—'}</strong>
        <span>{shown ? `pas ${step != null ? (step > 0 ? '+' : '') + step : '—'}°` : why || 'pas de mesure'}</span>
      </div>
      <div className={`goal-line ${fired ? 'on' : ''}`}>
        {target == null ? 'Touchez un point pour choisir le pas attendu' : fired ? `Icône déclenchée (${label(target)}°)` : `Attend ${label(target)}°`}
      </div>
    </section>
  );
}

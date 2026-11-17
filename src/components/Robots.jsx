import React from 'react';

// Three plain silhouettes of the robot, as the three icons of VPL3 show it: from the front (roll), from above (the orientation when it stands up)
// and from the side, front to the right (pitch). Drawn around (0, 0), about 70 units wide; the dial turns them.
export function RobotFront() {
  return (
    <g className="robot">
      <rect className="rb-wheel" x="-37" y="0" width="9" height="20" rx="4" />
      <rect className="rb-wheel" x="28" y="0" width="9" height="20" rx="4" />
      <rect className="rb-body" x="-29" y="-20" width="58" height="38" rx="10" />
      <circle className="rb-eye" cx="-11" cy="-6" r="3.6" />
      <circle className="rb-eye" cx="11" cy="-6" r="3.6" />
      <line className="rb-mouth" x1="-5" y1="6" x2="5" y2="6" />
    </g>
  );
}

export function RobotTop() {
  return (
    <g className="robot">
      <path className="rb-body" d="M-26 30 L-26 -4 Q-26 -32 0 -32 Q26 -32 26 -4 L26 30 Z" />
      <line className="rb-line" x1="-26" y1="12" x2="26" y2="12" />
      <circle className="rb-eye" cx="0" cy="-17" r="3" />
      <circle className="rb-eye" cx="0" cy="-3" r="3" />
      <circle className="rb-eye" cx="-7" cy="-10" r="3" />
      <circle className="rb-eye" cx="7" cy="-10" r="3" />
    </g>
  );
}

export function RobotSide() {
  return (
    <g className="robot">
      <rect className="rb-body" x="-34" y="-17" width="68" height="30" rx="10" />
      <circle className="rb-wheel" cx="-8" cy="13" r="13" />
      <circle className="rb-hub" cx="-8" cy="13" r="5" />
      <circle className="rb-eye" cx="24" cy="-6" r="3" />
      <circle className="rb-eye" cx="24" cy="3" r="3" />
    </g>
  );
}

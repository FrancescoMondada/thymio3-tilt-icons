// The Python (MicroPython, Thymio 3) that does what the page does: the three angles from imu.get_acc() and whether each icon is active. Built from
// the page's settings (thresholds, signs, calibration, margin), so that what is shown is what is computed. Pure: Node tests it by running it
// with python3 against src/tilt.js (tests/tilt.test.js).

const py = (v) => (typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));
const num = (v) => { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(4)); };

const fr = (v) => num(v).replace('.', ',');           // (in the prose: a decimal comma)
const deg = (rad) => (rad * 180) / Math.PI;

// When each icon is inactive, in words and in degrees, for the settings given.
export function activityRules(cfg) {
  return {
    pitch: { share: 'p', min: cfg.pMin, text: `inactif si p < ${fr(cfg.pMin)}: le robot est couché sur un côté (à plus de ${Math.round(deg(Math.acos(cfg.pMin)))}° de roll) et sa vue de côté n’est plus qu’une ligne` },
    roll: { share: 'q', min: cfg.qMin, text: `inactif si q < ${fr(cfg.qMin)}: le robot est sur la queue ou sur le nez (à plus de ${Math.round(deg(Math.acos(cfg.qMin)))}° de pitch)` },
    v: { share: 'r', min: cfg.rMin, text: `inactive si r < ${fr(cfg.rMin)}: le robot est presque à plat (à moins de ${Math.round(deg(Math.asin(cfg.rMin)))}° d’inclinaison)` },
  };
}

// `loop`: also the program that reads the robot and prints (imports thymio); without it, only the function and its settings (testable anywhere).
export function pythonCode(cfg, cal, { loop = true } = {}) {
  const head = loop ? 'import thymio\nimport time\nimport math\n' : 'import math\n';
  const body = `
# ---- réglages (ceux de la page) ----
FLIP = ${py(cfg.flip)}        # repère réel de imu.get_acc(): x vers l'arrière, y vers la droite, z vers le haut
X0 = ${num(cal.x0)}            # décalages de x et y mesurés robot à plat (calibration); z n'est jamais corrigé
Y0 = ${num(cal.y0)}
ZS = ${num(cal.zs)}             # signe de z à plat (+1: z = +16384 robot à plat)
P_MIN = ${num(cfg.pMin)}         # pitch actif si p >= P_MIN
Q_MIN = ${num(cfg.qMin)}         # roll actif si q >= Q_MIN
R_MIN = ${num(cfg.rMin)}         # orientation debout active si r >= R_MIN
SIGN_PITCH = ${num(cfg.signPitch)}
SIGN_ROLL = ${num(cfg.signRoll)}
SIGN_V = ${num(cfg.signV)}
STEP = ${num(cfg.step)}           # pas des icônes, en degrés (fenêtre de +/- STEP/2)
HYST = ${num(cfg.hyst)}           # marge (degrés) avant de changer de pas
SMOOTH = ${num(cfg.smooth)}          # mesures moyennées


def tilt(x, y, z):
    # Les trois angles (degrés) et si chaque icône est active, depuis une lecture brute de imu.get_acc().
    # Retourne (pitch, roll, v, pitch_actif, roll_actif, v_actif), ou None si g est nul (chute libre).
    xf = x - X0                       # avant (xf), gauche (yl), haut (zu): les axes du robot
    yl = y - Y0
    if FLIP:
        xf = -xf
        yl = -yl
    zu = ZS * z
    g = math.sqrt(xf * xf + yl * yl + zu * zu)
    if g < 1:
        return None
    h = math.sqrt(yl * yl + zu * zu)            # g dans le plan (gauche, haut): le roll n'entre pas dans le pitch
    p = math.sqrt(xf * xf + zu * zu) / g        # part de g dans le plan (avant, haut): 0 couché sur un côté
    q = h / g                                   # part de g dans le plan (gauche, haut): 0 sur la queue ou le nez
    r = math.sqrt(xf * xf + yl * yl) / g        # part de g dans le plan du robot: 0 à plat, 1 debout
    # pitch (vue de côté), -180..180: < 0 avant levé. Le signe de zu fait faire le tour complet.
    pitch = SIGN_PITCH * math.degrees(math.atan2(-xf, h if zu >= 0 else -h))
    # roll (vue de face), -180..180: > 0 côté gauche abaissé
    roll = SIGN_ROLL * math.degrees(math.atan2(-yl, zu))
    # orientation debout (vue de dessus), -180..180: 0 debout sur la queue (avant en haut), +90 sur le côté droit, sens horaire
    v = SIGN_V * math.degrees(math.atan2(yl, xf))
    return pitch, roll, v, p >= P_MIN, q >= Q_MIN, r >= R_MIN


def wrap180(a):
    return (a + 180) % 360 - 180


def next_step(cur, a):
    # Le pas (multiple de STEP) de l'angle a; il ne change que si a s'éloigne de plus de STEP/2 + HYST du pas courant.
    s = int(math.floor(a / STEP + 0.5)) * STEP
    s = max(-180, min(180, s))
    if cur is None or abs(wrap180(a - cur)) > STEP / 2 + HYST:
        return s
    return cur
`;
  if (!loop) return head + body;
  return `${head}${body}

# ---- programme d'essai: à coller dans la démo ts-api, robot posé à plat au lancement ----
imu = thymio.IMU()
recent = []
steps = [None, None, None]
names = ("pitch", "roll", "debout")
while True:
    a = imu.get_acc()
    recent.append(a)
    if len(recent) > SMOOTH:
        recent.pop(0)
    n = len(recent)
    t = tilt(sum([m[0] for m in recent]) / n, sum([m[1] for m in recent]) / n, sum([m[2] for m in recent]) / n)
    line = ""
    if t is not None:
        for i in range(3):
            if t[3 + i]:
                steps[i] = next_step(steps[i], t[i])
                line += "%s %+d (pas %+d)  " % (names[i], round(t[i]), steps[i])
            else:
                steps[i] = None
                line += "%s inactif  " % names[i]
    print(line)
    time.sleep(0.1)
`;
}

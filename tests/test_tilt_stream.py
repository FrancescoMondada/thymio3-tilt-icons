# Runs src/py/tilt_stream.py with a fake `thymio` module (no robot): what it says, in what format, and that it gives the behaviours back.
import sys, types, io, re, time as _time

out = io.StringIO()
state = {"enabled": True, "calls": 0}
readings = [(-12925, 217, 9876), (11917, 588, 11195), (526, -16050, 380)]

fake = types.ModuleType("thymio")
class BEHAVIORS:
    def disable_behaviors(self): state["enabled"] = False
    def enable_behaviors(self): state["enabled"] = True
class IMU:
    def get_acc(self):
        r = readings[state["calls"] % 3]
        state["calls"] += 1
        if state["calls"] > 6: raise KeyboardInterrupt()
        return r
fake.BEHAVIORS = BEHAVIORS; fake.IMU = IMU; fake.get_battery_voltage = lambda: 3900
sys.modules["thymio"] = fake
tm = types.ModuleType("time")
tm.ticks_ms = lambda: int(_time.time() * 1000); tm.ticks_diff = lambda a, b: a - b; tm.sleep_ms = lambda ms: None
sys.modules["time"] = tm

src = open("src/py/tilt_stream.py").read()
ns = {}
real = sys.stdout; sys.stdout = out
try:
    exec(compile(src, "tilt_stream.py", "exec"), ns)
    try: ns["run"](100)
    except KeyboardInterrupt: pass
finally: sys.stdout = real

lines = [l for l in re.split(r"[\x1e\r\n]+", out.getvalue()) if l.strip()]
assert lines[0].strip() == "@@hello 1", lines[0]
assert lines[1].strip() == "@@bat 3900", lines[1]
a = [l for l in lines if l.startswith("@@a ")]
assert len(a) == 6, len(a)
f = a[0].split()
assert len(f) == 5 and f[2:] == ["-12925", "217", "9876"], f
assert lines[-1].strip() == "@@bye", lines[-1]
assert state["enabled"] is True                     # the behaviours are given back
assert all(len(l) <= 100 for l in out.getvalue().split("\x1e")), "a line is longer than the 100 bytes the firmware batches"
print("ok: hello, bat, 6 x @@a, bye; behaviours given back; lines <= 100 bytes")

# Streams the Thymio 3 accelerometer to the page: the three tilt icons are computed by the page (src/tilt.js), the robot only reports.
#   @@hello 1 / @@bat mV / @@a ms x y z (every `period` ms, raw imu.get_acc) / @@bye
import thymio
import time

beh = thymio.BEHAVIORS()
imu = thymio.IMU()


def say(*parts):
    # The firmware sends stdout in batches: at 100 bytes, or after a second without output. A line padded to 100 bytes goes out at
    # once, ended by \x1e (record separator) instead of a newline that would only follow in the next batch.
    s = "@@" + " ".join([str(p) for p in parts])
    print(s + " " * (99 - len(s)) + "\x1e", end="")


def run(period=100):
    # the behaviours are switched off while the robot is handled: it must not move or light up by itself under the hands
    beh.disable_behaviors()
    try:
        say("hello", 1)
        try:
            say("bat", thymio.get_battery_voltage())
        except Exception:
            pass
        while True:
            t0 = time.ticks_ms()
            a = imu.get_acc()
            say("a", t0, a[0], a[1], a[2])
            left = period - time.ticks_diff(time.ticks_ms(), t0)
            if left > 0:
                time.sleep_ms(left)
    finally:
        beh.enable_behaviors()
        say("bye")

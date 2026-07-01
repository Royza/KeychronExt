#!/usr/bin/env python3
import re
import sys
from pathlib import Path

EXPECTED = [
    ("fn+F1", "Screen Brightness Down", {"KEY_BRIGHTNESSDOWN"}),
    ("fn+F2", "Screen Brightness Up", {"KEY_BRIGHTNESSUP"}),
    ("fn+F3", "Overview / Mission Control", {"KEY_LEFTMETA", "KEY_TAB"}),
    ("fn+F4", "Applications / Launchpad", {"KEY_LEFTMETA", "KEY_E", "KEY_DASHBOARD"}),
    ("fn+F5", "Firmware backlight pattern/effect", set()),
    ("fn+F6", "Firmware backlight pattern/effect", set()),
    ("fn+F7", "Previous/Rewind", {"KEY_PREVIOUSSONG", "KEY_REWIND"}),
    ("fn+F8", "Play/Pause", {"KEY_PLAYPAUSE"}),
    ("fn+F9", "Next/Fast Forward", {"KEY_NEXTSONG", "KEY_FASTFORWARD"}),
    ("fn+F10", "Mute", {"KEY_MUTE"}),
    ("fn+F11", "Volume Down", {"KEY_VOLUMEDOWN"}),
    ("fn+F12", "Volume Up", {"KEY_VOLUMEUP"}),
]


def read_text() -> str:
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).read_text()
    return sys.stdin.read()


def main() -> int:
    scan = None
    events = []
    for line in read_text().splitlines():
        if "EV_MSC" in line and "MSC_SCAN" in line:
            scan = line.rsplit("value ", 1)[-1].strip()
            continue

        match = re.search(r"EV_KEY\), code\s+(\d+)\s+\((KEY_[^)]+)\), value 1", line)
        if match:
            events.append((scan or "", match.group(1), match.group(2)))
            scan = None

    print("Observed key-down events:")
    for index, (scan_code, code, key) in enumerate(events, 1):
        print(f"{index:2}. scan={scan_code:<8} code={code:<4} key={key}")

    print("\nExpected combo coverage:")
    remaining = list(events)
    for combo, label, expected_keys in EXPECTED:
        if not expected_keys:
            print(f"REFERENCE {combo:<7} {label}: firmware-only/no Linux key expected")
            continue

        matched = []
        for event in remaining:
            if event[2] in expected_keys:
                matched.append(event)

        if matched:
            scans = ", ".join(f"{key}/{scan_code}" for scan_code, _code, key in matched)
            print(f"OK      {combo:<7} {label}: {scans}")
            for event in matched:
                if event in remaining:
                    remaining.remove(event)
        else:
            print(f"MISSING {combo:<7} {label}")

    if remaining:
        print("\nExtra key-down events:")
        for scan_code, code, key in remaining:
            print(f"scan={scan_code:<8} code={code:<4} key={key}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

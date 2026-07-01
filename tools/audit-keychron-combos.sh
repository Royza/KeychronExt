#!/usr/bin/env bash
set -euo pipefail

device="${1:-}"

if [[ -z "$device" ]]; then
  for name_file in /sys/class/input/event*/device/name; do
    [[ -e "$name_file" ]] || continue
    if [[ "$(cat "$name_file")" == "Keychron K5 Pro Keyboard" ]]; then
      event_name="${name_file#/sys/class/input/}"
      event_name="${event_name%%/*}"
      device="/dev/input/$event_name"
      break
    fi
  done
fi

if [[ -z "$device" || ! -e "$device" ]]; then
  echo "Could not find the Keychron K5 Pro input event device." >&2
  exit 1
fi

cat <<EOF
Capturing from $device

Press these K5 Pro combos one at a time. Pause briefly between each one.
Copy the EV_MSC / EV_KEY lines back into the chat when done.

Screen / system:
  1. fn+F1  expected: Screen Brightness Down
  2. fn+F2  expected: Screen Brightness Up
  3. fn+F3  expected: Overview / Mission Control
  4. fn+F4  expected: Applications / Launchpad

Keyboard backlight:
  5. fn+F5  expected: Firmware backlight pattern/effect
  6. fn+F6  expected: Firmware backlight pattern/effect

Media / audio:
  7. fn+F7  expected: Previous/Rewind
  8. fn+F8  expected: Play/Pause
  9. fn+F9  expected: Next/Fast Forward
 10. fn+F10 expected: Mute
 11. fn+F11 expected: Volume Down
 12. fn+F12 expected: Volume Up

When finished, press Ctrl+C.

EOF

exec sudo evtest "$device"

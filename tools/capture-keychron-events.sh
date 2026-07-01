#!/usr/bin/env bash
set -euo pipefail

device="${1:-}"

if [[ -z "$device" ]]; then
  device="$(
    for name_file in /sys/class/input/event*/device/name; do
      [[ -e "$name_file" ]] || continue
      if [[ "$(cat "$name_file")" == "Keychron K5 Pro Keyboard" ]]; then
        event_name="${name_file#/sys/class/input/}"
        event_name="${event_name%%/*}"
        printf '/dev/input/%s\n' "$event_name"
        break
      fi
    done
  )"
fi

if [[ -z "$device" || ! -e "$device" ]]; then
  echo "Could not find the Keychron K5 Pro input event device." >&2
  exit 1
fi

echo "Capturing from $device"
echo "Press the combo(s) you want to inspect, then press Ctrl+C."
echo

exec sudo evtest "$device"

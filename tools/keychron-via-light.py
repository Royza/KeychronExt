#!/usr/bin/env python3
import os
import json
import select
import sys
import time

REPORT_LEN = 32
ID_CUSTOM_SET_VALUE = 0x07
ID_CUSTOM_GET_VALUE = 0x08
ID_CUSTOM_SAVE = 0x09
ID_UNHANDLED = 0xFF
RGB_MATRIX_CHANNEL = 0x03
RGB_MATRIX_BRIGHTNESS = 0x01
RGB_MATRIX_EFFECT = 0x02
DEFAULT_RESTORE_BRIGHTNESS = 0xAF
DEFAULT_RESTORE_EFFECT = 0x01


def transfer(path, payload):
    request = bytes(payload[:REPORT_LEN]).ljust(REPORT_LEN, b"\0")
    fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
    try:
        os.write(fd, request)
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline:
            ready, _, _ = select.select([fd], [], [], max(0, deadline - time.monotonic()))
            if not ready:
                continue
            response = os.read(fd, REPORT_LEN)
            if response:
                return response
        raise TimeoutError("no response from keyboard")
    finally:
        os.close(fd)


def find_raw_hid():
    by_id = "/dev/input/by-id/usb-Keychron_Keychron_K5_Pro-if01-hidraw"
    if os.path.exists(by_id):
        return os.path.realpath(by_id)

    for name in sorted(os.listdir("/sys/class/hidraw")):
        uevent = f"/sys/class/hidraw/{name}/device/uevent"
        descriptor = f"/sys/class/hidraw/{name}/device/report_descriptor"
        try:
            text = open(uevent, encoding="utf-8").read()
            desc = open(descriptor, "rb").read()
        except OSError:
            continue

        if "00003434:00000250" in text and desc.startswith(bytes.fromhex("06 60 ff 09 61")):
            return f"/dev/{name}"

    raise SystemExit("Could not find Keychron K5 Pro VIA raw HID interface.")


def get_brightness(path):
    return get_value(path, RGB_MATRIX_BRIGHTNESS, "brightness")


def get_effect(path):
    return get_value(path, RGB_MATRIX_EFFECT, "effect")


def get_value(path, value_id, label):
    response = transfer(path, [ID_CUSTOM_GET_VALUE, RGB_MATRIX_CHANNEL, value_id])
    if response[0] == ID_UNHANDLED:
        raise SystemExit(f"Keyboard firmware did not handle VIA rgb_matrix {label}.")
    return response[3]


def set_brightness(path, value):
    return set_value(path, RGB_MATRIX_BRIGHTNESS, value, "brightness")


def set_effect(path, value):
    return set_value(path, RGB_MATRIX_EFFECT, value, "effect")


def set_value(path, value_id, value, label):
    value = max(0, min(255, int(value)))
    response = transfer(path, [ID_CUSTOM_SET_VALUE, RGB_MATRIX_CHANNEL, value_id, value])
    if response[0] == ID_UNHANDLED:
        raise SystemExit(f"Keyboard firmware rejected VIA rgb_matrix {label}.")
    return value


def save_state(path):
    response = transfer(path, [ID_CUSTOM_SAVE, RGB_MATRIX_CHANNEL])
    if response[0] == ID_UNHANDLED:
        raise SystemExit("Keyboard firmware rejected VIA rgb_matrix save.")


def state_path():
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/keychron-{os.getuid()}"
    os.makedirs(runtime_dir, exist_ok=True)
    return os.path.join(runtime_dir, "keychron-k5-pro-rgb-brightness")


def read_state():
    try:
        state = json.load(open(state_path(), encoding="utf-8"))
        if not isinstance(state, dict):
            return {}
        return state
    except (OSError, json.JSONDecodeError):
        return {}


def write_state(brightness, effect):
    with open(state_path(), "w", encoding="utf-8") as handle:
        json.dump({"brightness": brightness, "effect": effect}, handle)


def restore_value(key, fallback):
    try:
        value = int(read_state().get(key, fallback))
        if 1 <= value <= 255:
            return value
    except TypeError:
        pass
    except ValueError:
        pass

    return fallback


def toggle(path):
    brightness = get_brightness(path)
    effect = get_effect(path)
    enabled = brightness > 0 and effect > 0

    if enabled:
        write_state(brightness, effect)
        set_effect(path, 0)
        print("off")
    else:
        set_brightness(path, restore_value("brightness", DEFAULT_RESTORE_BRIGHTNESS))
        set_effect(path, restore_value("effect", DEFAULT_RESTORE_EFFECT))
        print("on")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "toggle"
    path = find_raw_hid()

    if command == "get":
        print(f"brightness={get_brightness(path)} effect={get_effect(path)}")
    elif command == "toggle":
        toggle(path)
    elif command == "save":
        save_state(path)
        print("saved")
    elif command == "set" and len(sys.argv) == 3:
        print(set_brightness(path, int(sys.argv[2], 0)))
    else:
        raise SystemExit("Usage: keychron-via-light.py [get|toggle|save|set VALUE]")


if __name__ == "__main__":
    main()

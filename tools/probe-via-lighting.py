#!/usr/bin/env python3
import os
import select
import sys
import time

REPORT_LEN = 32

COMMANDS = {
    "get_protocol": 0x01,
    "custom_set": 0x07,
    "custom_get": 0x08,
    "custom_save": 0x09,
    "unhandled": 0xFF,
}

CHANNELS = {
    1: "backlight",
    2: "rgblight",
    3: "rgb_matrix",
    5: "led_matrix",
}

VALUES = {
    1: "brightness",
    2: "effect",
    3: "effect_speed",
    4: "color",
}


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
        raise TimeoutError("no response")
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


def hex_bytes(data):
    return " ".join(f"{byte:02x}" for byte in data)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else find_raw_hid()
    print(f"raw HID: {path}")

    response = transfer(path, [COMMANDS["get_protocol"]])
    print(f"protocol: {hex_bytes(response[:8])}")

    for channel, channel_name in CHANNELS.items():
        for value, value_name in VALUES.items():
            response = transfer(path, [COMMANDS["custom_get"], channel, value])
            status = "handled" if response[0] != COMMANDS["unhandled"] else "unhandled"
            print(f"{channel_name}.{value_name}: {status} {hex_bytes(response[:8])}")


if __name__ == "__main__":
    main()

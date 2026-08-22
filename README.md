# Programmable Keyboard Controls

An independent GNOME Shell extension for the Keychron K5 Pro. It adds a panel
menu for battery status, standard desktop actions, software display dimming and
wired VIA RGB Matrix controls.

This project is unofficial and is not affiliated with or endorsed by Keychron.
No Keychron logos, artwork or firmware are included. The product name is used
only to identify compatible hardware.

## Compatibility

- GNOME Shell 50
- Keychron K5 Pro USB vendor/product ID `3434:0250`
- Primary tested variant: K5 Pro ANSI RGB
- A standard GNOME user session on Linux

GNOME Shell 50.3 on Fedora/Bazzite is the tested release. Older GNOME releases
are not claimed because they have not been tested against this version.

## Features

- Shows Bluetooth connection and battery percentage when BlueZ exposes the
  keyboard's `Battery1` interface.
- Controls VIA RGB Matrix brightness, effect, speed, hue and saturation over
  the keyboard's raw-HID interface while connected by USB.
- Automatically batches and saves lighting changes to the keyboard after 750 ms
  of inactivity, avoiding a persistent-memory write for every rapid adjustment.
- Stores ten local lighting profiles. Profiles can be captured and applied from
  the panel menu. The menu's `Manage Profiles…` action opens Preferences for
  renaming and clearing profiles.
- Shows on-demand model, connection, USB ID, RGB capability, VIA protocol and
  optional firmware-version information.
- Sends previous, play/pause and next commands to MPRIS media players.
- Controls the default GNOME audio output through GNOME's mixer API.
- Opens the default file manager without assuming a particular application.
- Provides a software dimmer for the primary display and handles the keyboard's
  standard screen-brightness keys while enabled.
- Lists firmware-only shortcuts as disabled reference rows.

The keyboard's Bluetooth profile selection, pairing, sleep configuration and
reset combinations are implemented by its firmware. GNOME cannot synthesize
those private `fn` combinations, so the extension does not pretend to run them.

## Runtime requirements

The extension has no Python, shell-script, `playerctl`, `wpctl`, `busctl` or
`gio` command dependency. It uses APIs already present in GNOME Shell 50:

- Gio and BlueZ D-Bus for Bluetooth state and battery data
- MPRIS D-Bus for media controls
- GNOME's Gvc mixer API for volume
- Gio application launching for the file manager
- Gio file streams for VIA raw HID

BlueZ is optional: without it, Bluetooth battery status is unavailable but the
extension remains usable. An MPRIS-compatible player is required only for the
three media menu actions.

## Wired RGB and device permissions

RGB controls work only in USB mode. Detection verifies USB ID `3434:0250` plus
the VIA usage descriptor while scanning `/sys/class/hidraw`. Bluetooth detection
uses BlueZ's matching modalias. Neither path uses a Bluetooth address, USB serial
number or machine-specific device path.

The logged-in user must have read/write permission for the matching `/dev/hidraw*`
device. Distribution policies differ; if RGB controls stay disabled, inspect:

```bash
ls -l /dev/input/by-id/*Keychron*K5*Pro*hidraw /dev/hidraw*
```

Do not make every HID device globally writable. Add a narrowly scoped udev rule
for vendor `3434`, product `0250` and the VIA interface according to your
distribution's policy.

## Installation

Once approved and published, install the extension from
[extensions.gnome.org](https://extensions.gnome.org/).

For a local development install from this checkout:

```bash
./install.sh
gnome-extensions enable k5-pro-controls@royza.github.io
```

Use `./install.sh --symlink` while developing. GNOME Shell caches extension
modules; after changing JavaScript for an already-loaded UUID on Wayland, log
out and back in before treating a test as conclusive.

To build the same minimal package intended for extensions.gnome.org:

```bash
mkdir -p dist
gnome-extensions pack --force --out-dir=dist \
  --extra-source=controller.js --extra-source=hid.js \
  --extra-source=profile.js .
```

Run the profile tests and JavaScript checks with:

```bash
npm ci
npm test
npm run lint
```

## Brightness behavior

The tested keyboard emits standard `XF86MonBrightnessDown` and
`XF86MonBrightnessUp` keys. The extension temporarily clears GNOME Shell's two
built-in brightness bindings, grabs those keys for its software dimmer, and
restores the exact values it found when disabled. The installer does not modify
the bindings.

The dimmer covers only the primary monitor's window layer, leaving Shell UI
visible. `Clear Software Dimmer` removes it immediately. This changes perceived
brightness, not monitor hardware brightness or power use.

## Troubleshooting

- **No panel indicator:** check `gnome-extensions info
  k5-pro-controls@royza.github.io` and the GNOME Shell journal.
- **RGB rows disabled:** connect by USB and check raw-HID permissions.
- **No battery percentage:** verify the keyboard is connected over Bluetooth
  and that BlueZ exposes `org.bluez.Battery1`.
- **Media action reports no player:** start an MPRIS-compatible media player.
- **Updated code does not load:** log out and back in to clear GNOME Shell's
  module cache.

Development observations and hardware diagnostic tools live in [`docs/`](docs/)
and [`tools/`](tools/). They are not part of the EGO upload ZIP.

## Development and support

Report bugs at <https://github.com/Royza/Keychron-K5-Pro-Gnome-Ext/issues>. Useful reports
include the GNOME Shell version, connection mode, whether the panel menu works,
and relevant non-sensitive journal messages.

The extension is licensed under `GPL-3.0-or-later`. See [LICENSE](LICENSE).

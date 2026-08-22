# Keychron K5 Pro Bazzite Audit

Observed on Bazzite GNOME with Keychron K5 Pro over Bluetooth:

| Combo | Expected | Observed Linux Input |
| --- | --- | --- |
| `fn+F1` | Screen Brightness Down | `KEY_BRIGHTNESSDOWN`, scan `c0070` |
| `fn+F2` | Screen Brightness Up | `KEY_BRIGHTNESSUP`, scan `c006f` |
| `fn+F3` | Mission Control / Overview | `KEY_LEFTMETA` + `KEY_TAB` |
| `fn+F4` | Launchpad / Applications | `KEY_LEFTMETA` + `KEY_E` |
| `fn+F5` | Keyboard Backlight Down | Firmware-only; user observed a backlight pattern/effect change |
| `fn+F6` | Keyboard Backlight Up | Firmware-only; user observed a backlight pattern/effect change |
| `fn+F7` | Rewind / Previous | `KEY_PREVIOUSSONG`, scan `c00b6` |
| `fn+F8` | Play / Pause | `KEY_PLAYPAUSE`, scan `c00cd` |
| `fn+F9` | Fast Forward / Next | `KEY_NEXTSONG`, scan `c00b5` |
| `fn+F10` | Mute | `KEY_MUTE`, scan `c00e2` |
| `fn+F11` | Volume Down | `KEY_VOLUMEDOWN`, scan `c00ea` |
| `fn+F12` | Volume Up | `KEY_VOLUMEUP`, scan `c00e9` |

Extension menu handling:

| Menu item | Extension state | Reason |
| --- | --- | --- |
| Screen Brightness Down / Up | Enabled, endpoint-aware | `fn+F1/F2` emit real brightness keys; extension uses software dimming for responsiveness because the tested external monitor rejected effective DDC writes. |
| App Switcher | Disabled reference | `fn+F3` already emits `Super+Tab`; GNOME owns the actual switcher behavior. |
| Open Files | Enabled | `fn+F4` emits `Super+E`; the extension can also open the default file manager through Gio. |
| Rewind / Play / Fast Forward | Enabled | These call compatible media players through MPRIS D-Bus. |
| Mute / Volume Down / Volume Up | Enabled | These use GNOME Shell's Gvc mixer API. |
| Backlight Off / On | Enabled in wired mode | Uses native GJS/Gio raw HID with VIA `rgb_matrix.brightness` and `rgb_matrix.effect` to toggle between off and the previous lighting state; physical `fn+Light key` is confirmed to toggle firmware backlight. |
| RGB brightness, effect, speed, hue, saturation, and profiles | Enabled in wired mode | Uses native GJS/Gio raw HID for VIA `rgb_matrix` values that this K5 Pro firmware handles directly. Changes are saved automatically after a short quiet period. Direct effect selection includes the firmware's Per-Key RGB and Mix RGB modes. Global speed and color controls are disabled for those two vendor-specific modes. |
| Lock Backlight Effect | Disabled reference | This remains a physical firmware shortcut and is not exposed as a VIA command. |
| Bluetooth profile, pairing, battery-check, and auto-sleep shortcuts | Disabled reference | These are keyboard-firmware actions, not OS-triggerable commands. |
| Clear Software Dimmer | Enabled only while dimmed | Removes the software dimmer immediately without requiring log out/in. |
| Reset the Keyboard | Enabled with confirmation | The extension only shows the reset shortcut after confirmation; it does not reset the keyboard by itself. |

Brightness key conclusion:

- The Keychron is emitting real screen-brightness keys for `fn+F1/F2`.
- No hwdb remap is needed for `fn+F1/F2`.
- The visual failure is display-stack related: the active monitors are external, while the kernel backlight device controls the inactive built-in panel.

External monitor brightness findings:

- The primary external monitor supports DDC/CI brightness reads.
- DDC/CI brightness writes returned success without changing the monitor value.
- The secondary external monitor did not expose DDC/CI brightness control.

Likely external-monitor fixes:

- Enable DDC/CI in the monitor OSD if disabled.
- Disable monitor modes that may lock brightness, such as HDR or some gaming presets.
- Use monitor hardware controls for displays that do not expose DDC/CI.

Keyboard backlight findings:

- GNOME's `org.gnome.SettingsDaemon.Power.Keyboard` interface exists, but its `Brightness` and `Steps` properties fail on this machine.
- No Keychron keyboard-backlight LED is exposed under `/sys/class/leds`.
- `fn+Light key` toggles the keyboard backlight off/on in firmware.
- Injecting `KEY_KBDILLUMTOGGLE` / `KEY_LIGHTS_TOGGLE` with `ydotool` does not toggle the firmware backlight.
- `/dev/hidraw2` is the K5 Pro VIA raw-HID interface in wired mode (`Usage Page ff60`).
- VIA lighting probe results: `rgb_matrix.brightness`, `rgb_matrix.effect`, `rgb_matrix.effect_speed`, and `rgb_matrix.color` are handled; legacy `backlight`, `rgblight`, and `led_matrix` channels are unhandled.
- First-load quirk: the keyboard may report `rgb_matrix.effect > 0` while `rgb_matrix.brightness == 0`. The extension treats either `effect == 0` or `brightness == 0` as off and restores both values when toggling on.
- Keychron's QMK firmware maps `fn+F5/F6` on the RGB Windows layer to RGB matrix brightness down/up. The extension exposes brightness, effects, speed, hue and saturation through VIA rather than treating them as reference-only firmware shortcuts. Changes are saved automatically.
- Direct testing showed that effect selection reads back immediately while lighting is off. Brightness, speed, hue, and saturation read back correctly once an RGB effect is active, so the extension disables those rows while the effect is `None`.

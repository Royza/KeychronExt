# Implementation Roadmap

Primary tested hardware: **Keychron K5 Pro ANSI RGB**, USB ID `3434:0250`.

## Implemented and hardware-tested

- Automatically persist lighting changes after 750 ms of inactivity.
- Flush a pending lighting save when the panel menu closes.
- Coalesce rapid changes into one non-volatile keyboard write.
- Remove the manual save action and save automatically. Successful saves stay
  silent; failures produce a notification that the change was not persisted.
- Store ten lighting profiles locally with an immutable `Default` name.
- Capture profiles from the keyboard and apply, save and read them back.
- Open GNOME Preferences from `Manage Profiles…` to rename and clear
  non-default profiles.
- Show model, connection, USB ID, RGB Matrix capability, VIA protocol and the
  optional firmware value on demand.
- Preserve compatibility when optional information queries are unsupported.

## Next safe phase

- Identify ANSI/ISO and RGB/white-backlight variants without using the GNOME
  input language as a proxy.
- Add read-only layout, layer, keymap and macro capability inspection.
- Export a complete backup before enabling keymap or macro writes.
- Validate imported data against the exact keyboard definition and firmware.

## Requires protocol evidence before implementation

- Per-key RGB zones.
- Mix RGB timelines and zones.
- Snap Action/SOCD assignments.
- Debounce/bounce timing.
- Keyboard sleep and backlight timeouts.
- Keychron-specific layout-language settings.

These controls are not assumed to use standard VIA commands. Capture one
Keychron Launcher action at a time and compare the raw HID reports before adding
any write path.

## Deliberately out of scope

- Firmware flashing from GNOME Shell.
- Background firmware downloads or page scraping.
- Continuous keymap, USB or lighting polling.
- Writes to HID devices that do not match the K5 Pro USB ID and VIA descriptor.

Firmware information and update links may be added later if Keychron provides a
stable authoritative source that can be queried only on user request.

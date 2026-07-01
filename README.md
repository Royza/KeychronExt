# Keychron K5 Pro Controls

A GNOME Shell extension for Bazzite GNOME that shows Keychron K5 Pro keyboard functions in the top panel.

Shortcut source: <https://www.keychron.com/blogs/news/k5-key-combinations>

Most `fn` combinations on Keychron keyboards are handled inside the keyboard firmware. GNOME cannot synthesize those private `fn` key presses directly, so this extension:

- Lists the non-Mac K5 Pro shortcuts from the Keychron key-combinations reference.
- Runs GNOME/OS equivalents for actions GNOME can control, such as media keys, volume, and best-effort screen brightness.
- Greys out firmware-only functions that GNOME cannot activate directly, while keeping them visible as reference.
- Shows the keyboard battery percentage in the menu title when the keyboard is visible through UPower.
- Requires confirmation before showing the reset-keyboard shortcut.

## Keyboard Backlight

The Keychron K5 Pro keyboard backlight and RGB effects are handled by keyboard firmware in this setup. GNOME exposes a keyboard-backlight D-Bus interface, but it does not provide working brightness properties for this Keychron and no Keychron backlight LED appears under `/sys/class/leds`.

The extension keeps firmware-only backlight shortcuts as reference items. The one exception is `Backlight Off / On`, which uses the K5 Pro's VIA raw-HID lighting interface when the keyboard is connected over USB.

On this K5 Pro, `fn+Light key` toggles the keyboard backlight off/on in firmware. The extension's `Backlight Off / On` row uses the keyboard's VIA raw-HID interface in wired mode and toggles RGB matrix state by restoring both brightness and effect mode. This matters because the keyboard can report a nonzero effect mode while brightness is `0`, especially after first load or a manual firmware toggle. `fn+F5/F6` appear to change backlight patterns/effects rather than exposing OS-controllable brightness.

## Install

For a normal install or after rebuilding Bazzite, clone/copy this project folder and run:

```bash
cd KeychronExt
./install.sh
```

The script installs the required extension files to:

```bash
~/.local/share/gnome-shell/extensions/keychron-k5-pro@local
```

It also installs `tools/keychron-via-light.py`, keeps `fn+F1/F2` assigned to this extension's software brightness handler, and tries to enable the extension.

If GNOME has not discovered the extension yet, log out and back in, then enable it:

```bash
gnome-extensions enable keychron-k5-pro@local
```

For development, install the current checkout as a symlink:

```bash
./install.sh --symlink
```

## Development Install

Manual symlink install:

```bash
rm -rf ~/.local/share/gnome-shell/extensions/keychron-k5-pro@local
ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/keychron-k5-pro@local
```

## Screen Brightness

The extension uses a GNOME software dimmer over windows on the primary monitor for responsive brightness changes. Hardware DDC/CI brightness was tested on an external monitor, but that setup reported successful writes without changing the monitor value, so the extension skips that slow failing path.

The dimmer is deliberately kept below the GNOME Shell UI so the panel and system controls remain visible. If needed, use `Clear Software Dimmer` in the extension's Maintenance section to remove the dimmer immediately.

GNOME Shell owns the hardware brightness keys by default. The extension clears Shell's built-in `XF86MonBrightnessDown/Up` bindings while it is enabled, grabs those keys for the software dimmer, and restores the original bindings when disabled. GNOME caches extension JavaScript modules, so changes to that key-grab code may require logging out and back in before they affect an already-running session.

On this Bazzite setup, `fn+F1/F2` already emit Linux screen-brightness keys:

- `fn+F1`: `KEY_BRIGHTNESSDOWN`, scan `c0070`
- `fn+F2`: `KEY_BRIGHTNESSUP`, scan `c006f`

If brightness still appears to do nothing, see [docs/keychron-k5-pro-bazzite-audit.md](docs/keychron-k5-pro-bazzite-audit.md). The likely cause is display-shell behavior rather than the keyboard mapping.

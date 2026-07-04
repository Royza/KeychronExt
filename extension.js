import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const UUID = 'keychron-k5-pro@local';
const BATTERY_REFRESH_SECONDS = 600;
const SOFTWARE_DIM_STEP = 16;
const SOFTWARE_DIM_MAX = 120;
const RGB_VALUE_MIN = 0;
const RGB_VALUE_MAX = 255;
const RGB_EFFECT_MIN = 0;
const RGB_EFFECT_MAX = 22;
const RGB_BRIGHTNESS_STEP = 16;
const RGB_SPEED_STEP = 16;
const RGB_COLOR_STEP = 16;
const SHELL_BRIGHTNESS_BINDING_DEFAULTS = {
    'screen-brightness-down': ['XF86MonBrightnessDown'],
    'screen-brightness-up': ['XF86MonBrightnessUp'],
};

const RGB_EFFECTS = [
    'None',
    'Solid Color',
    'Breathing',
    'Band Spiral Value',
    'Cycle All',
    'Cycle Left / Right',
    'Cycle Up / Down',
    'Rainbow Moving Chevron',
    'Cycle Out / In',
    'Cycle Out / In Dual',
    'Cycle Pinwheel',
    'Cycle Spiral',
    'Dual Beacon',
    'Rainbow Beacon',
    'Jellybean Raindrops',
    'Pixel Rain',
    'Typing Heatmap',
    'Digital Rain',
    'Reactive Simple',
    'Reactive Multiwide',
    'Reactive Multinexus',
    'Splash',
    'Solid Splash',
];

const UPowerIface = `<node>
  <interface name="org.freedesktop.UPower">
    <method name="EnumerateDevices"><arg type="ao" direction="out"/></method>
    <signal name="DeviceAdded"><arg type="o"/></signal>
    <signal name="DeviceRemoved"><arg type="o"/></signal>
  </interface>
</node>`;

const UPowerDeviceIface = `<node>
  <interface name="org.freedesktop.UPower.Device">
    <method name="Refresh"/>
    <property name="Model" type="s" access="read"/>
    <property name="NativePath" type="s" access="read"/>
    <property name="Percentage" type="d" access="read"/>
    <property name="PowerSupply" type="b" access="read"/>
    <property name="Type" type="u" access="read"/>
    <property name="Vendor" type="s" access="read"/>
  </interface>
</node>`;

const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerIface);
const UPowerDeviceProxy = Gio.DBusProxy.makeProxyWrapper(UPowerDeviceIface);

const ActionKind = {
    CALLBACK: 'callback',
    MEDIA: 'media',
    SCREEN_BRIGHTNESS: 'screen-brightness',
    FIRMWARE: 'firmware',
    REFERENCE: 'reference',
    RESET: 'reset',
};

const Indicator = GObject.registerClass(
class KeychronIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Keychron K5 Pro Controls');

        this._extension = extension;
        this._icon = new St.Icon({
            icon_name: 'input-keyboard-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'system-status-icon keychron-panel-icon',
        });
        this.add_child(this._icon);

        this._items = [];
        this._buildMenu();
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._extension.refreshState();
        });
    }

    setTitle(text) {
        this.accessible_name = text;
        if (this._statusItem)
            this._statusItem.label.text = text;
    }

    _buildMenu() {
        this._statusItem = new PopupMenu.PopupMenuItem('Keychron K5 Pro', {reactive: false});
        this._statusItem.add_style_class_name('keychron-menu-title');
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addRgbSection();

        this._addSection('Bluetooth', [
            ['Select Device 1', 'fn + 1 (BT firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Select Device 2', 'fn + 2 (BT firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Select Device 3', 'fn + 3 (BT firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 1', 'fn + 1, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 2', 'fn + 2, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 3', 'fn + 3, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Battery Check', 'fn + B (firmware LEDs)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Toggle Auto Sleep', 'fn + S + O, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 10 Minutes', 'fn + S + L + R, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 20 Minutes', 'fn + S + L + T, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 30 Minutes', 'fn + S + L + Y, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
        ]);

        this._addSection('System / Observed on Bazzite', [
            ['Screen Brightness Down', 'fn + F1 (c0070)', ActionKind.SCREEN_BRIGHTNESS, 'down'],
            ['Screen Brightness Up', 'fn + F2 (c006f)', ActionKind.SCREEN_BRIGHTNESS, 'up'],
            ['App Switcher', 'fn + F3 -> Super+Tab', ActionKind.REFERENCE],
            ['Open Files', 'fn + F4 -> Super+E', ActionKind.CALLBACK, () => this._extension.openFileManager()],
            ['Rewind', 'fn + F7', ActionKind.MEDIA, 'previous'],
            ['Play / Pause', 'fn + F8', ActionKind.MEDIA, 'play'],
            ['Fast Forward', 'fn + F9', ActionKind.MEDIA, 'next'],
            ['Mute Volume', 'fn + F10', ActionKind.MEDIA, 'mute'],
            ['Volume Down', 'fn + F11', ActionKind.MEDIA, 'volume-down'],
            ['Volume Up', 'fn + F12', ActionKind.MEDIA, 'volume-up'],
            ['Lock / Unlock Win Key', 'fn + Win, hold 3s', ActionKind.FIRMWARE],
            ['Switch F-Keys / Multimedia', 'fn + X + L, hold 3s', ActionKind.FIRMWARE],
        ]);

        this._addSection('Maintenance', [
            ['Clear Software Dimmer', 'restore primary display', ActionKind.CALLBACK, () => this._extension.clearSoftwareDimmer(), 'softwareDimActive'],
            ['Reset the Keyboard', 'fn + J + Z, hold 3s', ActionKind.RESET],
        ]);
    }

    _addSection(title, rows) {
        const section = new PopupMenu.PopupSubMenuMenuItem(title);
        section.add_style_class_name('keychron-submenu-title');

        for (const row of rows) {
            const [label, shortcut, kind, payload = null, stateKey = null] = row;
            this._addRow(section, label, shortcut, kind, payload, stateKey);
        }

        this.menu.addMenuItem(section);
    }

    _addRgbSection() {
        const section = new PopupMenu.PopupSubMenuMenuItem('Keyboard Backlight / RGB');
        section.add_style_class_name('keychron-submenu-title');

        this._addRow(section, 'Backlight Off / On', 'VIA rgb_matrix toggle', ActionKind.CALLBACK, () => this._extension.toggleKeyboardBacklight(), 'viaRgb');
        this._addRow(section, 'Brightness Down', 'VIA rgb_matrix brightness', ActionKind.CALLBACK, () => this._extension.adjustRgbBrightness(-RGB_BRIGHTNESS_STEP), 'rgbBrightnessDown');
        this._addRow(section, 'Brightness Up', 'VIA rgb_matrix brightness', ActionKind.CALLBACK, () => this._extension.adjustRgbBrightness(RGB_BRIGHTNESS_STEP), 'rgbBrightnessUp');
        this._addRow(section, 'Previous Effect', 'VIA rgb_matrix effect', ActionKind.CALLBACK, () => this._extension.adjustRgbEffect(-1), 'rgbEffectPrev');
        this._addRow(section, 'Next Effect', 'VIA rgb_matrix effect', ActionKind.CALLBACK, () => this._extension.adjustRgbEffect(1), 'rgbEffectNext');

        const effects = new PopupMenu.PopupSubMenuMenuItem('Select Effect');
        effects.add_style_class_name('keychron-submenu-title');
        for (let index = 0; index < RGB_EFFECTS.length; index++) {
            const name = RGB_EFFECTS[index];
            this._addRow(effects, name, `effect ${index}`, ActionKind.CALLBACK, () => this._extension.setRgbEffect(index), 'viaRgb');
        }
        section.menu.addMenuItem(effects);

        this._addRow(section, 'Speed Down', 'VIA rgb_matrix speed', ActionKind.CALLBACK, () => this._extension.adjustRgbSpeed(-RGB_SPEED_STEP), 'rgbSpeedDown');
        this._addRow(section, 'Speed Up', 'VIA rgb_matrix speed', ActionKind.CALLBACK, () => this._extension.adjustRgbSpeed(RGB_SPEED_STEP), 'rgbSpeedUp');
        this._addRow(section, 'Hue Down', 'VIA rgb_matrix color', ActionKind.CALLBACK, () => this._extension.adjustRgbHue(-RGB_COLOR_STEP), 'rgbColor');
        this._addRow(section, 'Hue Up', 'VIA rgb_matrix color', ActionKind.CALLBACK, () => this._extension.adjustRgbHue(RGB_COLOR_STEP), 'rgbColor');
        this._addRow(section, 'Saturation Down', 'VIA rgb_matrix color', ActionKind.CALLBACK, () => this._extension.adjustRgbSaturation(-RGB_COLOR_STEP), 'rgbSaturationDown');
        this._addRow(section, 'Saturation Up', 'VIA rgb_matrix color', ActionKind.CALLBACK, () => this._extension.adjustRgbSaturation(RGB_COLOR_STEP), 'rgbSaturationUp');
        this._addRow(section, 'Save Lighting Settings', 'VIA rgb_matrix save', ActionKind.CALLBACK, () => this._extension.saveRgbLighting(), 'viaRgb');
        this._addRow(section, 'Lock Backlight Effect', 'fn + L + Light, hold 3s', ActionKind.FIRMWARE);

        this.menu.addMenuItem(section);
    }

    _addRow(section, label, shortcut, kind, payload = null, stateKey = null) {
        const item = new PopupMenu.PopupMenuItem('');
        if (kind === ActionKind.RESET)
            item.add_style_class_name('keychron-danger');
        item.remove_child(item.label);

        const box = new St.BoxLayout({x_expand: true});
        box.add_child(new St.Label({text: label, x_expand: true}));
        box.add_child(new St.Label({text: shortcut, style_class: 'keychron-shortcut'}));
        item.add_child(box);

        item.connect('activate', () => this._extension.activateAction({label, shortcut, kind, payload}));
        section.menu.addMenuItem(item);
        this._items.push({item, kind, payload, stateKey, label});
        return item;
    }

    syncState(state) {
        for (const {item, kind, payload, stateKey} of this._items) {
            let sensitive = true;
            const rgbActive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MIN;

            if (kind === ActionKind.FIRMWARE || kind === ActionKind.REFERENCE)
                sensitive = false;
            else if (stateKey === 'viaRgb')
                sensitive = state.rgbAvailable;
            else if (stateKey === 'rgbBrightnessDown')
                sensitive = rgbActive && state.rgbBrightness !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbBrightnessUp')
                sensitive = rgbActive && state.rgbBrightness !== RGB_VALUE_MAX;
            else if (stateKey === 'rgbEffectPrev')
                sensitive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MIN;
            else if (stateKey === 'rgbEffectNext')
                sensitive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MAX;
            else if (stateKey === 'rgbSpeedDown')
                sensitive = rgbActive && state.rgbSpeed !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbSpeedUp')
                sensitive = rgbActive && state.rgbSpeed !== RGB_VALUE_MAX;
            else if (stateKey === 'rgbColor')
                sensitive = rgbActive;
            else if (stateKey === 'rgbSaturationDown')
                sensitive = rgbActive && state.rgbSaturation !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbSaturationUp')
                sensitive = rgbActive && state.rgbSaturation !== RGB_VALUE_MAX;
            else if (stateKey === 'bluetoothOnly')
                sensitive = state.bluetoothMode;
            else if (kind === ActionKind.SCREEN_BRIGHTNESS && payload === 'up')
                sensitive = state.softwareDim > 0;
            else if (kind === ActionKind.SCREEN_BRIGHTNESS && payload === 'down')
                sensitive = state.softwareDim < SOFTWARE_DIM_MAX;
            else if (stateKey === 'softwareDimActive')
                sensitive = state.softwareDim > 0;

            item.setSensitive(sensitive);
        }
    }
});

class ConfirmResetDialog extends ModalDialog.ModalDialog {
    constructor(extension, shortcut) {
        super();

        this._extension = extension;
        const title = new St.Label({
            text: 'Reset the Keychron K5 Pro keyboard?',
            style_class: 'keychron-menu-title',
        });
        const detail = new St.Label({
            text: `This does not run automatically. Confirming will show the hardware shortcut: ${shortcut}`,
        });

        title.clutter_text.line_wrap = true;
        detail.clutter_text.line_wrap = true;

        this.contentLayout.add_child(title);
        this.contentLayout.add_child(detail);

        this.setButtons([
            {
                label: 'Cancel',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
            },
            {
                label: 'Show Reset Shortcut',
                action: () => {
                    this.close();
                    this._extension.notifyShortcut('Reset the Keyboard', shortcut);
                },
            },
        ]);
    }
}

export default class KeychronK5ProExtension extends Extension {
    enable() {
        this._state = {
            bluetoothMode: false,
            batteryPercent: null,
            batteryKnown: false,
            softwareDim: 0,
            rgbAvailable: false,
            rgbBrightness: null,
            rgbEffect: null,
            rgbSpeed: null,
            rgbHue: null,
            rgbSaturation: null,
        };
        this._softwareDimmer = null;
        this._stageCaptureId = null;
        this._acceleratorActivatedId = null;
        this._brightnessAccelerators = new Map();
        this._shellKeybindingSettings = null;
        this._savedShellBrightnessBindings = null;
        this._monitorsChangedId = null;

        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(UUID, this._indicator);

        this._upower = new UPowerProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            () => this.refreshBattery()
        );

        this._upowerSignalIds = [];
        this._connectUPowerSignals();
        this._stageCaptureId = global.stage.connect('captured-event', (_actor, event) => {
            return this._onCapturedEvent(event);
        });
        this._grabBrightnessKeys();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._syncSoftwareDimmer();
        });

        this.refreshState();
        this._batteryTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            BATTERY_REFRESH_SECONDS,
            () => {
                this.refreshBattery();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    disable() {
        if (this._batteryTimer) {
            GLib.source_remove(this._batteryTimer);
            this._batteryTimer = null;
        }

        this._disconnectUPowerSignals();
        if (this._stageCaptureId) {
            global.stage.disconnect(this._stageCaptureId);
            this._stageCaptureId = null;
        }
        this._releaseBrightnessKeys();
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        this._destroySoftwareDimmer();

        this._indicator?.destroy();
        this._indicator = null;
        this._upower = null;
        this._shellKeybindingSettings = null;
        this._savedShellBrightnessBindings = null;
        this._state = null;
    }

    activateAction(action) {
        switch (action.kind) {
        case ActionKind.CALLBACK:
            action.payload();
            break;
        case ActionKind.MEDIA:
            this._sendMediaKey(action.payload);
            break;
        case ActionKind.SCREEN_BRIGHTNESS:
            this._runBrightnessHelper(action.payload);
            break;
        case ActionKind.RESET:
            new ConfirmResetDialog(this, action.shortcut).open();
            break;
        case ActionKind.REFERENCE:
        case ActionKind.FIRMWARE:
        default:
            this.notifyShortcut(action.label, action.shortcut);
            break;
        }
    }

    notifyShortcut(label, shortcut) {
        Main.notify('Keychron K5 Pro', `${label}: ${shortcut}`);
    }

    _onCapturedEvent(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;

        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_XF86MonBrightnessDown) {
            this._runBrightnessHelper('down');
            return Clutter.EVENT_PROPAGATE;
        }

        if (symbol === Clutter.KEY_XF86MonBrightnessUp) {
            this._runBrightnessHelper('up');
            return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _grabBrightnessKeys() {
        this._suspendShellBrightnessBindings();

        this._acceleratorActivatedId = global.display.connect(
            'accelerator-activated',
            (_display, action) => this._onAcceleratorActivated(action)
        );

        this._grabBrightnessAccelerator('XF86MonBrightnessDown', 'down');
        this._grabBrightnessAccelerator('XF86MonBrightnessUp', 'up');
    }

    _grabBrightnessAccelerator(accelerator, direction) {
        try {
            const action = global.display.grab_accelerator(accelerator, 0);
            if (action === Meta.KeyBindingAction.NONE) {
                log(`Keychron K5 Pro: failed to grab ${accelerator}`);
                return;
            }

            const name = Meta.external_binding_name_for_action(action);
            Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);
            this._brightnessAccelerators.set(action, {name, direction});
        } catch (error) {
            logError(error, `Keychron K5 Pro: failed to grab ${accelerator}`);
        }
    }

    _onAcceleratorActivated(action) {
        const binding = this._brightnessAccelerators.get(action);
        if (!binding)
            return;

        this._runBrightnessHelper(binding.direction);
    }

    _releaseBrightnessKeys() {
        for (const [action, binding] of this._brightnessAccelerators) {
            try {
                global.display.ungrab_accelerator(action);
                Main.wm.allowKeybinding(binding.name, Shell.ActionMode.NONE);
            } catch (error) {
                logError(error, `Keychron K5 Pro: failed to release ${binding.name}`);
            }
        }

        this._brightnessAccelerators.clear();

        if (this._acceleratorActivatedId) {
            global.display.disconnect(this._acceleratorActivatedId);
            this._acceleratorActivatedId = null;
        }

        this._restoreShellBrightnessBindings();
    }

    _suspendShellBrightnessBindings() {
        try {
            this._shellKeybindingSettings = new Gio.Settings({
                schema_id: 'org.gnome.shell.keybindings',
            });
            this._savedShellBrightnessBindings = {};

            for (const [key, fallback] of Object.entries(SHELL_BRIGHTNESS_BINDING_DEFAULTS)) {
                const current = this._shellKeybindingSettings.get_strv(key);
                this._savedShellBrightnessBindings[key] = current.length > 0 ? current : fallback;
            }

            this._shellKeybindingSettings.set_value('screen-brightness-down', new GLib.Variant('as', []));
            this._shellKeybindingSettings.set_value('screen-brightness-up', new GLib.Variant('as', []));
            Gio.Settings.sync();
        } catch (error) {
            logError(error, 'Keychron K5 Pro: failed to suspend GNOME screen brightness keybindings');
        }
    }

    _restoreShellBrightnessBindings() {
        if (!this._shellKeybindingSettings || !this._savedShellBrightnessBindings)
            return;

        try {
            for (const [key, value] of Object.entries(this._savedShellBrightnessBindings))
                this._shellKeybindingSettings.set_value(key, new GLib.Variant('as', value));
            Gio.Settings.sync();
        } catch (error) {
            logError(error, 'Keychron K5 Pro: failed to restore GNOME screen brightness keybindings');
        }
    }

    refreshState() {
        this.refreshBattery();
        this.refreshRgbState();
        this._syncIndicator();
    }

    refreshRgbState() {
        const helper = GLib.build_filenamev([this.path, 'tools', 'keychron-via-light.py']);

        this._spawnText(['python3', helper, 'get'], (stdout, status) => {
            if (!this._state)
                return;

            if (status !== 0) {
                this._state.rgbAvailable = false;
                this._syncIndicator();
                return;
            }

            const state = this._parseKeyValueOutput(stdout);
            this._state.rgbAvailable = true;
            this._state.rgbBrightness = state.brightness ?? null;
            this._state.rgbEffect = state.effect ?? null;
            this._state.rgbSpeed = state.speed ?? null;
            this._state.rgbHue = state.hue ?? null;
            this._state.rgbSaturation = state.saturation ?? null;
            this._syncIndicator();
        });
    }

    refreshBattery() {
        this._refreshBlueZBattery();

        if (!this._upower)
            return;

        try {
            this._upower.EnumerateDevicesRemote((devices, error) => {
                if (error || !devices) {
                    this._setBattery({connected: false, percent: null, known: false}, false);
                    return;
                }

                this._readKeyboardBattery(devices[0] ?? []);
            });
        } catch (error) {
            logError(error, 'Unable to refresh Keychron battery');
            this._setBattery({connected: false, percent: null, known: false}, false);
        }
    }

    _sendMediaKey(key) {
        const map = {
            'previous': 'command -v playerctl >/dev/null 2>&1 || exit 77; playerctl previous',
            'play': 'command -v playerctl >/dev/null 2>&1 || exit 77; playerctl play-pause',
            'next': 'command -v playerctl >/dev/null 2>&1 || exit 77; playerctl next',
            'mute': 'command -v wpctl >/dev/null 2>&1 || exit 78; wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle',
            'volume-down': 'command -v wpctl >/dev/null 2>&1 || exit 78; wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-',
            'volume-up': 'command -v wpctl >/dev/null 2>&1 || exit 78; wpctl set-volume -l 1.5 @DEFAULT_AUDIO_SINK@ 5%+',
        };

        this._spawn(['bash', '-lc', map[key]], status => {
            if (status === 77)
                Main.notify('Keychron K5 Pro', 'Install playerctl to control media playback from the extension.');
            else if (status === 78)
                Main.notify('Keychron K5 Pro', 'wpctl is required for volume controls.');
        });
    }

    openFileManager() {
        this._spawn(['gio', 'open', GLib.get_home_dir()]);
    }

    toggleKeyboardBacklight() {
        const helper = GLib.build_filenamev([this.path, 'tools', 'keychron-via-light.py']);

        this._spawnText(['python3', helper, 'toggle'], (stdout, status) => {
            if (status !== 0) {
                Main.notify('Keychron K5 Pro', 'Keyboard backlight toggle failed. VIA raw HID may only be available in wired mode.');
                return;
            }

            if (stdout === 'off')
                Main.notify('Keychron K5 Pro', 'Keyboard backlight off.');
            else if (stdout === 'on')
                Main.notify('Keychron K5 Pro', 'Keyboard backlight on.');
            this.refreshRgbState();
        });
    }

    adjustRgbBrightness(delta) {
        this._runLightingCommand(['set', this._boundedRgbValue(this._state.rgbBrightness, delta).toString()], 'Keyboard brightness updated.');
    }

    adjustRgbEffect(delta) {
        this._runLightingCommand(['effect', delta.toString()], 'Keyboard effect updated.');
    }

    setRgbEffect(effect) {
        const name = RGB_EFFECTS[effect] ?? `Effect ${effect}`;
        this._runLightingCommand(['set-effect', effect.toString()], `Keyboard effect set to ${name}.`);
    }

    adjustRgbSpeed(delta) {
        this._runLightingCommand(['speed', delta.toString()], 'Keyboard effect speed updated.');
    }

    adjustRgbHue(delta) {
        this._runLightingCommand(['hue', delta.toString()], 'Keyboard color hue updated.');
    }

    adjustRgbSaturation(delta) {
        this._runLightingCommand(['saturation', delta.toString()], 'Keyboard color saturation updated.');
    }

    saveRgbLighting() {
        this._runLightingCommand(['save'], 'Keyboard lighting settings saved.');
    }

    _runLightingCommand(args, successMessage) {
        const helper = GLib.build_filenamev([this.path, 'tools', 'keychron-via-light.py']);

        this._spawnText(['python3', helper, ...args], (_stdout, status) => {
            if (status !== 0) {
                Main.notify('Keychron K5 Pro', 'Keyboard lighting command failed. VIA raw HID may only be available in wired mode.');
                this.refreshRgbState();
                return;
            }

            Main.notify('Keychron K5 Pro', successMessage);
            this.refreshRgbState();
        });
    }

    _boundedRgbValue(current, delta) {
        const base = Number.isFinite(current) ? current : 0;
        return Math.max(RGB_VALUE_MIN, Math.min(RGB_VALUE_MAX, base + delta));
    }

    _parseKeyValueOutput(stdout) {
        const values = {};
        for (const token of stdout.trim().split(/\s+/)) {
            const [key, rawValue] = token.split('=');
            const value = Number.parseInt(rawValue, 10);
            if (key && Number.isFinite(value))
                values[key] = value;
        }
        return values;
    }

    clearSoftwareDimmer() {
        this._state.softwareDim = 0;
        this._destroySoftwareDimmer();
        this._indicator?.syncState(this._state);
    }

    _runBrightnessHelper(direction) {
        const before = this._state.softwareDim;
        this._adjustSoftwareDim(direction);

        if (before === this._state.softwareDim)
            Main.notify('Keychron K5 Pro', `Software brightness is already at ${direction === 'up' ? 'maximum' : 'minimum'}.`);
    }

    _adjustSoftwareDim(direction) {
        const delta = direction === 'down' ? SOFTWARE_DIM_STEP : -SOFTWARE_DIM_STEP;
        this._state.softwareDim = Math.max(0, Math.min(SOFTWARE_DIM_MAX, this._state.softwareDim + delta));
        this._syncSoftwareDimmer();
        this._indicator?.syncState(this._state);
    }

    _softwareBrightnessPercent() {
        return Math.round((1 - (this._state.softwareDim / SOFTWARE_DIM_MAX)) * 100);
    }

    _syncSoftwareDimmer() {
        if (!this._state)
            return;

        if (this._state.softwareDim <= 0) {
            this._destroySoftwareDimmer();
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        if (!this._softwareDimmer) {
            this._softwareDimmer = new St.Widget({
                reactive: false,
                style: 'background-color: black;',
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
            });
            global.window_group.add_child(this._softwareDimmer);
        }

        this._softwareDimmer.set_position(monitor.x, monitor.y);
        this._softwareDimmer.set_size(monitor.width, monitor.height);
        this._softwareDimmer.opacity = this._state.softwareDim;
        global.window_group.set_child_above_sibling(this._softwareDimmer, null);
        this._softwareDimmer.show();
    }

    _destroySoftwareDimmer() {
        if (!this._softwareDimmer)
            return;

        this._softwareDimmer.destroy();
        this._softwareDimmer = null;
    }

    _spawn(argv, onExit = null) {
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            proc.wait_check_async(null, (_proc, result) => {
                try {
                    proc.wait_check_finish(result);
                    onExit?.(0);
                } catch (error) {
                    onExit?.(proc.get_exit_status());
                }
            });
        } catch (error) {
            logError(error, `Failed to run ${argv.join(' ')}`);
            onExit?.(-1);
        }
    }

    _spawnText(argv, onExit) {
        try {
            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (_proc, result) => {
                try {
                    const [, stdout] = proc.communicate_utf8_finish(result);
                    onExit(stdout.trim(), proc.get_successful() ? 0 : proc.get_exit_status());
                } catch (error) {
                    onExit('', proc.get_exit_status());
                }
            });
        } catch (error) {
            logError(error, `Failed to run ${argv.join(' ')}`);
            onExit('', -1);
        }
    }

    _connectUPowerSignals() {
        if (!this._upower)
            return;

        this._upowerSignalIds.push(this._upower.connectSignal('DeviceAdded', () => this.refreshBattery()));
        this._upowerSignalIds.push(this._upower.connectSignal('DeviceRemoved', () => this.refreshBattery()));
    }

    _disconnectUPowerSignals() {
        if (!this._upower)
            return;

        for (const id of this._upowerSignalIds)
            this._upower.disconnectSignal(id);
        this._upowerSignalIds = [];
    }

    _readKeyboardBattery(paths) {
        if (paths.length === 0) {
            this._setBattery({connected: false, percent: null, known: false}, false);
            return;
        }

        let pending = paths.length;
        let found = false;

        const finishOne = () => {
            pending--;
            if (pending === 0 && !found)
                this._setBattery({connected: false, percent: null, known: false}, false);
        };

        for (const path of paths) {
            new UPowerDeviceProxy(
                Gio.DBus.system,
                'org.freedesktop.UPower',
                path,
                (_proxy, error) => {
                    if (error) {
                        finishOne();
                        return;
                    }

                    if (this._isKeyboardBattery(_proxy)) {
                        found = true;
                        this._setBattery({
                            connected: true,
                            percent: Math.round(_proxy.Percentage),
                            known: true,
                        }, true);
                    }

                    finishOne();
                }
            );
        }
    }

    _isKeyboardBattery(proxy) {
        const haystack = `${proxy.Vendor} ${proxy.Model} ${proxy.NativePath}`.toLowerCase();
        return !proxy.PowerSupply &&
            (proxy.Type === 5 || proxy.Type === 6) &&
            (haystack.includes('keychron') || haystack.includes('k5') || haystack.includes('keyboard'));
    }

    _refreshBlueZBattery() {
        const script = `
set -eu
for path in $(busctl --system tree org.bluez 2>/dev/null | sed -n 's/.*\\(\\/org\\/bluez\\/hci[0-9][^ ]*\\/dev_[A-Fa-f0-9_]*\\).*/\\1/p'); do
  alias="$(busctl --system get-property org.bluez "$path" org.bluez.Device1 Alias 2>/dev/null | sed 's/^s "//; s/"$//')"
  name="$(busctl --system get-property org.bluez "$path" org.bluez.Device1 Name 2>/dev/null | sed 's/^s "//; s/"$//')"
  connected="$(busctl --system get-property org.bluez "$path" org.bluez.Device1 Connected 2>/dev/null || true)"
  label="$(printf '%s %s' "$alias" "$name" | tr '[:upper:]' '[:lower:]')"
  if printf '%s' "$label" | grep -Eq 'keychron|k5'; then
    if [ "$connected" = "b true" ]; then
      pct="$(busctl --system get-property org.bluez "$path" org.bluez.Battery1 Percentage 2>/dev/null | awk '{print $2}' || true)"
      if [ -n "$pct" ]; then
        printf 'connected:%s\\n' "$pct"
      else
        printf 'connected:\\n'
      fi
      exit 0
    fi
  fi
done
printf 'none:\\n'
`;

        this._spawnText(['bash', '-lc', script], stdout => {
            if (!this._state)
                return;

            if (stdout.startsWith('connected:')) {
                const rawPercent = stdout.split(':')[1];
                const percent = rawPercent === '' ? null : Number.parseInt(rawPercent, 10);
                this._setBattery({
                    connected: true,
                    percent: Number.isFinite(percent) ? percent : null,
                    known: Number.isFinite(percent),
                }, true);
            } else {
                this._setBattery({connected: false, percent: null, known: false}, true);
            }
        });
    }

    _setBattery(state, authoritative) {
        if (authoritative || !this._state.bluetoothMode) {
            this._state.bluetoothMode = state.connected;
            this._state.batteryPercent = state.percent;
            this._state.batteryKnown = state.known;
        }

        this._syncIndicator();
    }

    _syncIndicator() {
        if (!this._indicator || !this._state)
            return;

        let title = 'K5 Pro';
        if (this._state.batteryKnown)
            title = `K5 Pro ${this._state.batteryPercent}%`;
        else if (this._state.bluetoothMode)
            title = 'K5 Pro BT';

        this._indicator.setTitle(title);
        this._indicator.syncState(this._state);
    }
}

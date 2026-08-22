// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {HidController} from './hid.js';
import {
    normalizeProfileNames,
    normalizeProfileValues,
    parseProfile,
    PROFILE_COUNT,
    serializeProfile,
} from './profile.js';

const BATTERY_REFRESH_SECONDS = 120;
const APPLICATION_NAME = 'Keychron K5 Pro Controls';
const SOFTWARE_DIM_STEP = 16;
const SOFTWARE_DIM_MAX = 120;
const RGB_VALUE_MIN = 0;
const RGB_VALUE_MAX = 255;
const RGB_BRIGHTNESS_MAX = 254;
const RGB_EFFECT_MIN = 0;
const RGB_EFFECT_MAX = 24;
const RGB_BRIGHTNESS_STEP = 16;
const RGB_SPEED_STEP = 16;
const RGB_COLOR_STEP = 16;
const LIGHTING_SAVE_DELAY_MS = 750;
const SHELL_BRIGHTNESS_KEYS = [
    'screen-brightness-down',
    'screen-brightness-up',
];

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
    'Per-Key RGB',
    'Mix RGB',
];

const ActionKind = {
    CALLBACK: 'callback',
    MEDIA: 'media',
    SCREEN_BRIGHTNESS: 'screen-brightness',
    FIRMWARE: 'firmware',
    REFERENCE: 'reference',
    RESET: 'reset',
};

function isCancelled(error) {
    return error instanceof GLib.Error &&
        error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function dbusCall(connection, busName, path, interfaceName, methodName,
    parameters, replyType, cancellable, timeout = 3000) {
    return new Promise((resolve, reject) => {
        connection.call(
            busName,
            path,
            interfaceName,
            methodName,
            parameters,
            replyType,
            Gio.DBusCallFlags.NONE,
            timeout,
            cancellable,
            (_connection, result) => {
                try {
                    resolve(connection.call_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

const Indicator = GObject.registerClass(
class KeyboardIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, extension.metadata.name);

        this._extension = extension;
        this._icon = new St.Icon({
            icon_name: 'input-keyboard-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'system-status-icon keyboard-panel-icon',
        });
        this.add_child(this._icon);

        this._items = [];
        this._profileSlots = [];
        this._infoValues = new Map();
        this._buildMenu();
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._extension.refreshState();
            else
                this._extension.flushPendingLightingSave();
        });
    }

    setTitle(text) {
        this.accessible_name = text;
        if (this._statusItem)
            this._statusItem.label.text = text;
    }

    _buildMenu() {
        this._statusItem = new PopupMenu.PopupMenuItem('Keyboard', {reactive: false});
        this._statusItem.add_style_class_name('keyboard-menu-title');
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addRgbSection();
        this._addProfilesSection();

        this._addSection('Bluetooth', [
            ['Select Device 1', 'fn + 1 (firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Select Device 2', 'fn + 2 (firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Select Device 3', 'fn + 3 (firmware)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 1', 'fn + 1, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 2', 'fn + 2, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Pair Device 3', 'fn + 3, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Battery Check', 'fn + B (firmware LEDs)', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Toggle Auto Sleep', 'fn + S + O, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 10 Minutes', 'fn + S + L + R, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 20 Minutes', 'fn + S + L + T, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
            ['Auto Sleep 30 Minutes', 'fn + S + L + Y, hold 3s', ActionKind.FIRMWARE, null, 'bluetoothOnly'],
        ]);

        this._addSection('System', [
            ['Screen Brightness Down', 'fn + F1', ActionKind.SCREEN_BRIGHTNESS, 'down'],
            ['Screen Brightness Up', 'fn + F2', ActionKind.SCREEN_BRIGHTNESS, 'up'],
            ['App Switcher', 'fn + F3 -> Super+Tab', ActionKind.REFERENCE],
            ['Open Files', 'fn + F4 -> Super+E', ActionKind.CALLBACK, () => this._extension.openFileManager()],
            ['Previous Track', 'fn + F7', ActionKind.MEDIA, 'Previous'],
            ['Play / Pause', 'fn + F8', ActionKind.MEDIA, 'PlayPause'],
            ['Next Track', 'fn + F9', ActionKind.MEDIA, 'Next'],
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

        this._addDeviceInfoSection();
    }

    _addSection(title, rows) {
        const section = new PopupMenu.PopupSubMenuMenuItem(title);
        section.add_style_class_name('keyboard-submenu-title');

        for (const row of rows) {
            const [label, shortcut, kind, payload = null, stateKey = null] = row;
            this._addRow(section, label, shortcut, kind, payload, stateKey);
        }

        this.menu.addMenuItem(section);
    }

    _addRgbSection() {
        const section = new PopupMenu.PopupSubMenuMenuItem('Keyboard Backlight / RGB');
        section.add_style_class_name('keyboard-submenu-title');

        this._addRow(section, 'Backlight Off / On', 'VIA RGB toggle', ActionKind.CALLBACK, () => this._extension.toggleKeyboardBacklight(), 'viaRgb');
        this._addRow(section, 'Brightness Down', 'VIA RGB brightness', ActionKind.CALLBACK, () => this._extension.adjustRgbBrightness(-RGB_BRIGHTNESS_STEP), 'rgbBrightnessDown');
        this._addRow(section, 'Brightness Up', 'VIA RGB brightness', ActionKind.CALLBACK, () => this._extension.adjustRgbBrightness(RGB_BRIGHTNESS_STEP), 'rgbBrightnessUp');
        this._addRow(section, 'Previous Effect', 'VIA RGB effect', ActionKind.CALLBACK, () => this._extension.adjustRgbEffect(-1), 'rgbEffectPrev');
        this._addRow(section, 'Next Effect', 'VIA RGB effect', ActionKind.CALLBACK, () => this._extension.adjustRgbEffect(1), 'rgbEffectNext');
        this._addRow(section, 'Speed Down', 'VIA RGB speed', ActionKind.CALLBACK, () => this._extension.adjustRgbSpeed(-RGB_SPEED_STEP), 'rgbSpeedDown');
        this._addRow(section, 'Speed Up', 'VIA RGB speed', ActionKind.CALLBACK, () => this._extension.adjustRgbSpeed(RGB_SPEED_STEP), 'rgbSpeedUp');
        this._addRow(section, 'Hue Down', 'VIA RGB color', ActionKind.CALLBACK, () => this._extension.adjustRgbHue(-RGB_COLOR_STEP), 'rgbColor');
        this._addRow(section, 'Hue Up', 'VIA RGB color', ActionKind.CALLBACK, () => this._extension.adjustRgbHue(RGB_COLOR_STEP), 'rgbColor');
        this._addRow(section, 'Saturation Down', 'VIA RGB color', ActionKind.CALLBACK, () => this._extension.adjustRgbSaturation(-RGB_COLOR_STEP), 'rgbSaturationDown');
        this._addRow(section, 'Saturation Up', 'VIA RGB color', ActionKind.CALLBACK, () => this._extension.adjustRgbSaturation(RGB_COLOR_STEP), 'rgbSaturationUp');
        this._addRow(section, 'Lock Backlight Effect', 'fn + L + Light, hold 3s', ActionKind.FIRMWARE);

        this.menu.addMenuItem(section);
        this._addRgbEffectsSection();
    }

    _addRgbEffectsSection() {
        const section = new PopupMenu.PopupSubMenuMenuItem('RGB Effects');
        section.add_style_class_name('keyboard-submenu-title');

        for (let index = 0; index < RGB_EFFECTS.length; index++) {
            this._addRow(
                section,
                RGB_EFFECTS[index],
                `effect ${index}`,
                ActionKind.CALLBACK,
                () => this._extension.setRgbEffect(index),
                'viaRgb'
            );
        }

        this.menu.addMenuItem(section);
    }

    _addProfilesSection() {
        const section = new PopupMenu.PopupSubMenuMenuItem('Lighting Profiles');
        section.add_style_class_name('keyboard-submenu-title');

        for (let index = 0; index < PROFILE_COUNT; index++) {
            const item = new PopupMenu.PopupMenuItem('');
            item.remove_child(item.label);
            const box = new St.BoxLayout({
                x_expand: true,
                style_class: 'keyboard-menu-row',
            });
            const label = new St.Label({x_expand: true});
            const hint = new St.Label({style_class: 'keyboard-shortcut'});
            box.add_child(label);
            box.add_child(hint);
            item.add_child(box);
            item.connect('activate', () =>
                this._extension.activateLightingProfileSlot(index));
            section.menu.addMenuItem(item);
            this._items.push({
                item,
                kind: ActionKind.CALLBACK,
                payload: null,
                stateKey: `profileSlot:${index}`,
            });
            this._profileSlots.push({label, hint});
        }

        section.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addRow(
            section,
            'Manage Profiles…',
            'rename and clear profiles',
            ActionKind.CALLBACK,
            () => this._extension.openProfilePreferences()
        );

        this.menu.addMenuItem(section);
    }

    _addDeviceInfoSection() {
        const section = new PopupMenu.PopupSubMenuMenuItem('Device Information');
        section.add_style_class_name('keyboard-submenu-title');
        this._addInfoRow(section, 'Model', 'modelName');
        this._addInfoRow(section, 'Connection', 'connection');
        this._addInfoRow(section, 'USB ID', 'usbId');
        this._addInfoRow(section, 'VIA Protocol', 'protocolVersion');
        this._addInfoRow(section, 'Firmware Version', 'firmwareVersion');
        this._addInfoRow(section, 'RGB Matrix', 'rgbCapability');
        this.menu.addMenuItem(section);
    }

    _addInfoRow(section, label, key) {
        const item = new PopupMenu.PopupMenuItem('', {reactive: false});
        item.remove_child(item.label);
        const box = new St.BoxLayout({
            x_expand: true,
            style_class: 'keyboard-menu-row',
        });
        box.add_child(new St.Label({text: label, x_expand: true}));
        const value = new St.Label({
            text: '—',
            style_class: 'keyboard-shortcut',
        });
        box.add_child(value);
        item.add_child(box);
        section.menu.addMenuItem(item);
        this._infoValues.set(key, value);
    }

    _addRow(section, label, shortcut, kind, payload = null, stateKey = null) {
        const item = new PopupMenu.PopupMenuItem('');
        if (kind === ActionKind.RESET)
            item.add_style_class_name('keyboard-danger');
        item.remove_child(item.label);

        const box = new St.BoxLayout({
            x_expand: true,
            style_class: 'keyboard-menu-row',
        });
        box.add_child(new St.Label({text: label, x_expand: true}));
        box.add_child(new St.Label({text: shortcut, style_class: 'keyboard-shortcut'}));
        item.add_child(box);

        item.connect('activate', () => this._extension.activateAction({
            label,
            shortcut,
            kind,
            payload,
        }));
        section.menu.addMenuItem(item);
        this._items.push({item, kind, payload, stateKey});
        return item;
    }

    syncProfiles(names, values) {
        for (let index = 0; index < this._profileSlots.length; index++) {
            const {label, hint} = this._profileSlots[index];
            label.text = names[index];
            hint.text = values[index] ? 'apply saved lighting' : 'save current lighting';
        }
    }

    syncInfo(state) {
        const connection = state.rgbAvailable
            ? 'USB'
            : state.bluetoothMode ? 'Bluetooth' : 'Not detected';
        const values = {
            modelName: state.modelName ?? 'K5 Pro',
            connection,
            usbId: '3434:0250',
            protocolVersion: Number.isInteger(state.protocolVersion)
                ? `0x${state.protocolVersion.toString(16).padStart(4, '0')}`
                : 'Unavailable',
            firmwareVersion: Number.isInteger(state.firmwareVersion) && state.firmwareVersion > 0
                ? state.firmwareVersion.toString()
                : 'Not reported',
            rgbCapability: state.rgbAvailable ? 'Available' : 'Unavailable',
        };
        for (const [key, label] of this._infoValues)
            label.text = values[key] ?? '—';
    }

    syncState(state) {
        for (const {item, kind, payload, stateKey} of this._items) {
            let sensitive = true;
            const rgbActive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MIN;
            const standardRgbEffect = rgbActive && state.rgbEffect < 23;

            if (kind === ActionKind.FIRMWARE || kind === ActionKind.REFERENCE)
                sensitive = false;
            else if (stateKey === 'viaRgb')
                sensitive = state.rgbAvailable;
            else if (stateKey === 'rgbBrightnessDown')
                sensitive = rgbActive && state.rgbBrightness !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbBrightnessUp')
                sensitive = rgbActive && state.rgbBrightness !== RGB_BRIGHTNESS_MAX;
            else if (stateKey === 'rgbEffectPrev')
                sensitive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MIN;
            else if (stateKey === 'rgbEffectNext')
                sensitive = state.rgbAvailable && state.rgbEffect !== RGB_EFFECT_MAX;
            else if (stateKey === 'rgbSpeedDown')
                sensitive = standardRgbEffect && state.rgbSpeed !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbSpeedUp')
                sensitive = standardRgbEffect && state.rgbSpeed !== RGB_VALUE_MAX;
            else if (stateKey === 'rgbColor')
                sensitive = standardRgbEffect;
            else if (stateKey === 'rgbSaturationDown')
                sensitive = standardRgbEffect && state.rgbSaturation !== RGB_VALUE_MIN;
            else if (stateKey === 'rgbSaturationUp')
                sensitive = standardRgbEffect && state.rgbSaturation !== RGB_VALUE_MAX;
            else if (stateKey === 'bluetoothOnly')
                sensitive = state.bluetoothMode;
            else if (kind === ActionKind.SCREEN_BRIGHTNESS && payload === 'up')
                sensitive = state.softwareDim > 0;
            else if (kind === ActionKind.SCREEN_BRIGHTNESS && payload === 'down')
                sensitive = state.softwareDim < SOFTWARE_DIM_MAX;
            else if (stateKey === 'softwareDimActive')
                sensitive = state.softwareDim > 0;
            else if (stateKey?.startsWith('profileSlot:'))
                sensitive = state.rgbAvailable;

            item.setSensitive(sensitive);
        }
    }
});

class ConfirmResetDialog extends ModalDialog.ModalDialog {
    constructor(shortcut) {
        super();

        const title = new St.Label({
            text: 'Reset the keyboard?',
            style_class: 'keyboard-menu-title',
        });
        const detail = new St.Label({
            text: `The extension will not reset it. The hardware shortcut is ${shortcut}`,
        });
        title.clutter_text.line_wrap = true;
        detail.clutter_text.line_wrap = true;
        this.contentLayout.add_child(title);
        this.contentLayout.add_child(detail);

        this.setButtons([
            {
                label: 'Close',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
            },
        ]);
    }
}

export class KeyboardController {
    constructor(extension) {
        this._extension = extension;
    }

    get metadata() {
        return this._extension.metadata;
    }

    get uuid() {
        return this._extension.uuid;
    }

    enable() {
        this._enabled = true;
        this._cancellable = new Gio.Cancellable();
        this._hid = new HidController();
        this._settings = this._extension.getSettings();
        this._state = {
            modelName: null,
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
            protocolVersion: null,
            firmwareVersion: null,
            profileNames: normalizeProfileNames(this._settings.get_strv('profile-names')),
            profileValues: normalizeProfileValues(this._settings.get_strv('profile-values')),
        };
        this._softwareDimmer = null;
        this._brightnessAccelerators = new Map();
        this._shellKeybindingSettings = null;
        this._savedShellBrightnessBindings = null;
        this._acceleratorActivatedId = null;
        this._monitorsChangedId = null;
        this._resetDialog = null;
        this._batteryRequest = 0;
        this._rgbRequest = 0;
        this._lightingRevision = 0;
        this._lightingSaveTimer = null;
        this._settingsSignalIds = [
            this._settings.connect('changed::profile-names', () => this._loadProfiles()),
            this._settings.connect('changed::profile-values', () => this._loadProfiles()),
        ];

        this._mixerControl = new Gvc.MixerControl({name: this.metadata.name});
        this._mixerControl.open();

        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

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

    destroy() {
        this._enabled = false;
        this._batteryRequest++;
        this._rgbRequest++;
        this._cancellable.cancel();
        this._hid.destroy();

        if (this._lightingSaveTimer) {
            GLib.Source.remove(this._lightingSaveTimer);
            this._lightingSaveTimer = null;
        }

        if (this._batteryTimer) {
            GLib.Source.remove(this._batteryTimer);
            this._batteryTimer = null;
        }

        this._releaseBrightnessKeys();
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        this._destroySoftwareDimmer();

        if (this._resetDialog) {
            const dialog = this._resetDialog;
            this._resetDialog = null;
            dialog.close();
            dialog.destroy();
        }

        this._indicator.destroy();
        this._mixerControl.close();
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);

        this._indicator = null;
        this._mixerControl = null;
        this._hid = null;
        this._cancellable = null;
        this._settings = null;
        this._settingsSignalIds = null;
        this._state = null;
        this._shellKeybindingSettings = null;
        this._savedShellBrightnessBindings = null;
        this._extension = null;
    }

    activateAction(action) {
        switch (action.kind) {
        case ActionKind.CALLBACK:
            action.payload();
            break;
        case ActionKind.MEDIA:
            if (action.payload.startsWith('volume') || action.payload === 'mute')
                this._changeVolume(action.payload);
            else
                this._sendMediaKey(action.payload);
            break;
        case ActionKind.SCREEN_BRIGHTNESS:
            this._runBrightnessAction(action.payload);
            break;
        case ActionKind.RESET:
            this._showResetDialog(action.shortcut);
            break;
        default:
            break;
        }
    }

    refreshState() {
        this.refreshBattery();
        this.refreshRgbState();
        this._syncIndicator();
    }

    async refreshBattery() {
        const request = ++this._batteryRequest;
        try {
            const result = await dbusCall(
                Gio.DBus.system,
                'org.bluez',
                '/',
                'org.freedesktop.DBus.ObjectManager',
                'GetManagedObjects',
                null,
                new GLib.VariantType('(a{oa{sa{sv}}})'),
                this._cancellable
            );
            if (!this._enabled || request !== this._batteryRequest)
                return;

            const [objects] = result.deepUnpack();
            let connected = false;
            let percent = null;
            for (const interfaces of Object.values(objects)) {
                const device = interfaces['org.bluez.Device1'];
                if (!device)
                    continue;

                const modalias = device.Modalias?.deepUnpack?.() ?? '';
                const isTarget = modalias.toLowerCase().startsWith('usb:v3434p0250');
                if (!isTarget)
                    continue;

                this._state.modelName = 'K5 Pro';
                if (!device.Connected?.deepUnpack?.())
                    continue;

                connected = true;
                const battery = interfaces['org.bluez.Battery1'];
                if (battery?.Percentage)
                    percent = Number(battery.Percentage.deepUnpack());
                break;
            }

            this._state.bluetoothMode = connected;
            this._state.batteryPercent = Number.isFinite(percent) ? percent : null;
            this._state.batteryKnown = Number.isFinite(percent);
            this._syncIndicator();
        } catch (error) {
            if (!isCancelled(error) && this._enabled) {
                this._state.bluetoothMode = false;
                this._state.batteryPercent = null;
                this._state.batteryKnown = false;
                this._syncIndicator();
            }
        }
    }

    async refreshRgbState() {
        const request = ++this._rgbRequest;
        const hid = this._hid;
        try {
            const state = await hid.getState();
            if (!this._enabled || hid !== this._hid || request !== this._rgbRequest)
                return;

            this._state.rgbAvailable = true;
            this._state.modelName = 'K5 Pro';
            this._state.rgbBrightness = state.brightness;
            this._state.rgbEffect = state.effect;
            this._state.rgbSpeed = state.speed;
            this._state.rgbHue = state.hue;
            this._state.rgbSaturation = state.saturation;
            this._state.protocolVersion = state.protocolVersion;
            this._state.firmwareVersion = state.firmwareVersion;
            this._syncIndicator();
        } catch {
            if (!this._enabled || hid !== this._hid || request !== this._rgbRequest)
                return;
            this._state.rgbAvailable = false;
            this._syncIndicator();
        }
    }

    async _sendMediaKey(method) {
        try {
            const result = await dbusCall(
                Gio.DBus.session,
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                'ListNames',
                null,
                new GLib.VariantType('(as)'),
                this._cancellable
            );
            const [names] = result.deepUnpack();
            const players = names.filter(name => name.startsWith('org.mpris.MediaPlayer2.'));

            for (const player of players) {
                try {
                    await dbusCall(
                        Gio.DBus.session,
                        player,
                        '/org/mpris/MediaPlayer2',
                        'org.mpris.MediaPlayer2.Player',
                        method,
                        null,
                        null,
                        this._cancellable
                    );
                    return;
                } catch (error) {
                    if (isCancelled(error))
                        throw error;
                }
            }

            if (this._enabled)
                Main.notify(APPLICATION_NAME, 'No compatible media player is running.');
        } catch (error) {
            if (!isCancelled(error) && this._enabled)
                Main.notify(APPLICATION_NAME, 'The media command could not be sent.');
        }
    }

    _changeVolume(action) {
        const sink = this._mixerControl.get_default_sink();
        if (!sink) {
            Main.notify(APPLICATION_NAME, 'No default audio output is available.');
            return;
        }

        if (action === 'mute') {
            sink.change_is_muted(!sink.get_is_muted());
            return;
        }

        const step = Math.round(this._mixerControl.get_vol_max_norm() * 0.05);
        const upper = this._mixerControl.get_vol_max_amplified();
        const delta = action === 'volume-up' ? step : -step;
        sink.set_volume(Math.max(0, Math.min(upper, sink.get_volume() + delta)));
        sink.push_volume();
    }

    openFileManager() {
        const uri = Gio.File.new_for_path(GLib.get_home_dir()).get_uri();
        Gio.AppInfo.launch_default_for_uri_async(
            uri,
            null,
            this._cancellable,
            (_source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (error) {
                    if (!isCancelled(error) && this._enabled)
                        Main.notify(APPLICATION_NAME, 'The default file manager could not be opened.');
                }
            }
        );
    }

    openProfilePreferences() {
        try {
            this._extension.openPreferences();
        } catch {
            Main.notify(APPLICATION_NAME, 'Profile Preferences could not be opened.');
        }
    }

    toggleKeyboardBacklight() {
        this._runLightingAction(
            hid => hid.toggle(),
            enabled => `Keyboard backlight ${enabled ? 'on' : 'off'}.`
        );
    }

    adjustRgbBrightness(delta) {
        const current = Number.isFinite(this._state.rgbBrightness)
            ? this._state.rgbBrightness
            : 0;
        const value = Math.max(RGB_VALUE_MIN, Math.min(RGB_BRIGHTNESS_MAX, current + delta));
        this._runLightingAction(hid => hid.setBrightness(value), 'Keyboard brightness updated.');
    }

    adjustRgbEffect(delta) {
        this._runLightingAction(hid => hid.adjustEffect(delta), 'Keyboard effect updated.');
    }

    setRgbEffect(effect) {
        const name = RGB_EFFECTS[effect] ?? `Effect ${effect}`;
        this._runLightingAction(hid => hid.setEffect(effect), `Keyboard effect set to ${name}.`);
    }

    adjustRgbSpeed(delta) {
        this._runLightingAction(hid => hid.adjustSpeed(delta), 'Keyboard effect speed updated.');
    }

    adjustRgbHue(delta) {
        this._runLightingAction(hid => hid.adjustHue(delta), 'Keyboard color hue updated.');
    }

    adjustRgbSaturation(delta) {
        this._runLightingAction(hid => hid.adjustSaturation(delta), 'Keyboard color saturation updated.');
    }

    async _runLightingAction(operation, successMessage) {
        const hid = this._hid;
        try {
            const result = await operation(hid);
            if (!this._enabled || hid !== this._hid)
                return;
            const message = typeof successMessage === 'function'
                ? successMessage(result)
                : successMessage;
            Main.notify(APPLICATION_NAME, message);
            this._scheduleLightingSave();
            this.refreshRgbState();
        } catch {
            if (this._enabled && hid === this._hid) {
                Main.notify(
                    APPLICATION_NAME,
                    'Keyboard lighting command failed. VIA raw HID is available only over USB and requires device permission.'
                );
                this.refreshRgbState();
            }
        }
    }

    _scheduleLightingSave() {
        this._lightingRevision++;
        if (this._lightingSaveTimer)
            GLib.Source.remove(this._lightingSaveTimer);

        const revision = this._lightingRevision;
        this._lightingSaveTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            LIGHTING_SAVE_DELAY_MS,
            () => {
                this._lightingSaveTimer = null;
                this._persistLighting(revision);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    flushPendingLightingSave() {
        if (!this._lightingSaveTimer)
            return;

        GLib.Source.remove(this._lightingSaveTimer);
        this._lightingSaveTimer = null;
        this._persistLighting(this._lightingRevision);
    }

    async _persistLighting(revision) {
        const hid = this._hid;
        try {
            await hid.save();
            if (!this._enabled || hid !== this._hid || revision !== this._lightingRevision)
                return;
        } catch {
            if (!this._enabled || hid !== this._hid || revision !== this._lightingRevision)
                return;
            Main.notify(
                APPLICATION_NAME,
                'Lighting changed, but automatic saving failed. Reconnect by USB and try another change.'
            );
        }
    }

    async captureLightingProfile(index) {
        const hid = this._hid;
        try {
            const state = await hid.getState();
            if (!this._enabled || hid !== this._hid)
                return;
            const values = normalizeProfileValues(this._settings.get_strv('profile-values'));
            values[index] = serializeProfile(state);
            this._settings.set_strv('profile-values', values);
            Main.notify(
                APPLICATION_NAME,
                `${this._state.profileNames[index]} captured from the keyboard.`
            );
        } catch {
            if (this._enabled && hid === this._hid) {
                Main.notify(
                    APPLICATION_NAME,
                    'The lighting profile could not be captured. Connect the keyboard by USB.'
                );
            }
        }
    }

    activateLightingProfileSlot(index) {
        if (parseProfile(this._state.profileValues[index]))
            this.applyLightingProfile(index);
        else
            this.captureLightingProfile(index);
    }

    async applyLightingProfile(index) {
        const profile = parseProfile(this._state.profileValues[index]);
        if (!profile) {
            Main.notify(APPLICATION_NAME, 'That lighting profile is empty or invalid.');
            return;
        }

        const hid = this._hid;
        try {
            const state = await hid.applyState(profile);
            if (!this._enabled || hid !== this._hid)
                return;
            this._state.rgbBrightness = state.brightness;
            this._state.rgbEffect = state.effect;
            this._state.rgbSpeed = state.speed;
            this._state.rgbHue = state.hue;
            this._state.rgbSaturation = state.saturation;
            this._syncIndicator();
            Main.notify(
                APPLICATION_NAME,
                `${this._state.profileNames[index]} applied, verified, and saved to the keyboard.`
            );
        } catch {
            if (this._enabled && hid === this._hid) {
                Main.notify(
                    APPLICATION_NAME,
                    'The profile was not fully applied or verified. The keyboard was not reported as saved.'
                );
                this.refreshRgbState();
            }
        }
    }

    _loadProfiles() {
        if (!this._state || !this._settings)
            return;
        this._state.profileNames = normalizeProfileNames(
            this._settings.get_strv('profile-names')
        );
        this._state.profileValues = normalizeProfileValues(
            this._settings.get_strv('profile-values')
        );
        this._syncIndicator();
    }

    clearSoftwareDimmer() {
        this._state.softwareDim = 0;
        this._destroySoftwareDimmer();
        this._indicator.syncState(this._state);
    }

    _runBrightnessAction(direction) {
        const before = this._state.softwareDim;
        const delta = direction === 'down' ? SOFTWARE_DIM_STEP : -SOFTWARE_DIM_STEP;
        this._state.softwareDim = Math.max(
            0,
            Math.min(SOFTWARE_DIM_MAX, this._state.softwareDim + delta)
        );
        this._syncSoftwareDimmer();
        this._indicator.syncState(this._state);

        if (before === this._state.softwareDim) {
            const endpoint = direction === 'up' ? 'maximum' : 'minimum';
            Main.notify(APPLICATION_NAME, `Software brightness is already at ${endpoint}.`);
        }
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
        if (this._softwareDimmer)
            this._softwareDimmer.destroy();
        this._softwareDimmer = null;
    }

    _grabBrightnessKeys() {
        try {
            this._shellKeybindingSettings = new Gio.Settings({
                schema_id: 'org.gnome.shell.keybindings',
            });
            this._savedShellBrightnessBindings = new Map();
            for (const key of SHELL_BRIGHTNESS_KEYS) {
                this._savedShellBrightnessBindings.set(
                    key,
                    this._shellKeybindingSettings.get_strv(key)
                );
                this._shellKeybindingSettings.set_strv(key, []);
            }

            this._acceleratorActivatedId = global.display.connect(
                'accelerator-activated',
                (_display, action) => this._onAcceleratorActivated(action)
            );

            const down = this._grabBrightnessAccelerator('XF86MonBrightnessDown', 'down');
            const up = this._grabBrightnessAccelerator('XF86MonBrightnessUp', 'up');
            if (!down || !up)
                this._releaseBrightnessKeys();
        } catch (error) {
            console.error(`${APPLICATION_NAME}: brightness key setup failed: ${error.message}`);
            this._releaseBrightnessKeys();
        }
    }

    _grabBrightnessAccelerator(accelerator, direction) {
        const action = global.display.grab_accelerator(accelerator, 0);
        if (action === Meta.KeyBindingAction.NONE)
            return false;

        const name = Meta.external_binding_name_for_action(action);
        Main.wm.allowKeybinding(name, Shell.ActionMode.ALL);
        this._brightnessAccelerators.set(action, {name, direction});
        return true;
    }

    _onAcceleratorActivated(action) {
        const binding = this._brightnessAccelerators.get(action);
        if (binding)
            this._runBrightnessAction(binding.direction);
    }

    _releaseBrightnessKeys() {
        for (const [action, {name}] of this._brightnessAccelerators ?? []) {
            try {
                global.display.ungrab_accelerator(action);
                Main.wm.allowKeybinding(name, Shell.ActionMode.NONE);
            } catch (error) {
                console.error(`${APPLICATION_NAME}: failed to release ${name}: ${error.message}`);
            }
        }
        this._brightnessAccelerators.clear();

        if (this._acceleratorActivatedId) {
            global.display.disconnect(this._acceleratorActivatedId);
            this._acceleratorActivatedId = null;
        }

        if (this._shellKeybindingSettings && this._savedShellBrightnessBindings) {
            for (const [key, value] of this._savedShellBrightnessBindings) {
                try {
                    this._shellKeybindingSettings.set_strv(key, value);
                } catch (error) {
                    console.error(`${APPLICATION_NAME}: failed to restore ${key}: ${error.message}`);
                }
            }
        }
        this._savedShellBrightnessBindings = null;
    }

    _showResetDialog(shortcut) {
        if (this._resetDialog)
            return;

        const dialog = new ConfirmResetDialog(shortcut);
        this._resetDialog = dialog;
        dialog.connect('closed', () => {
            if (this._resetDialog === dialog) {
                this._resetDialog = null;
                dialog.destroy();
            }
        });
        dialog.open();
    }

    _syncIndicator() {
        if (!this._indicator || !this._state)
            return;

        const modelName = this._state.modelName ?? 'K5 Pro';
        let title = `Keyboard: ${modelName}`;
        if (this._state.batteryKnown)
            title = `Keyboard: ${modelName} ${this._state.batteryPercent}%`;
        else if (this._state.bluetoothMode)
            title = `Keyboard: ${modelName} BT`;

        this._indicator.setTitle(title);
        this._indicator.syncProfiles(this._state.profileNames, this._state.profileValues);
        this._indicator.syncInfo(this._state);
        this._indicator.syncState(this._state);
    }
}

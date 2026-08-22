// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const REPORT_LENGTH = 32;
const TRANSFER_TIMEOUT_MS = 1500;
const HID_ID = 'HID_ID=0003:00003434:00000250';
const VIA_DESCRIPTOR_PREFIX = [0x06, 0x60, 0xff, 0x09, 0x61];

const COMMAND_SET = 0x07;
const COMMAND_GET = 0x08;
const COMMAND_SAVE = 0x09;
const COMMAND_GET_PROTOCOL_VERSION = 0x01;
const COMMAND_GET_KEYBOARD_VALUE = 0x02;
const COMMAND_UNHANDLED = 0xff;
const KEYBOARD_VALUE_FIRMWARE_VERSION = 0x04;
const RGB_MATRIX_CHANNEL = 0x03;
const VALUE_BRIGHTNESS = 0x01;
const VALUE_EFFECT = 0x02;
const VALUE_SPEED = 0x03;
const VALUE_COLOR = 0x04;

const DEFAULT_BRIGHTNESS = 0xaf;
const DEFAULT_EFFECT = 0x01;
const BRIGHTNESS_MAX = 254;
const EFFECT_MAX = 24;

function clamp(value, lower = 0, upper = 255) {
    return Math.max(lower, Math.min(upper, Math.trunc(value)));
}

function isCancelled(error) {
    return error instanceof GLib.Error &&
        error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function loadBytes(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.load_bytes_async(cancellable, (_file, result) => {
            try {
                const [bytes] = file.load_bytes_finish(result);
                resolve(bytes.get_data());
            } catch (error) {
                reject(error);
            }
        });
    });
}

function enumerateNames(directory, cancellable) {
    return new Promise((resolve, reject) => {
        directory.enumerate_children_async(
            Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_directory, result) => {
                let enumerator;
                try {
                    enumerator = directory.enumerate_children_finish(result);
                } catch (error) {
                    reject(error);
                    return;
                }

                enumerator.next_files_async(
                    64,
                    GLib.PRIORITY_DEFAULT,
                    cancellable,
                    (_enumerator, nextResult) => {
                        try {
                            const names = enumerator.next_files_finish(nextResult)
                                .map(info => info.get_name());
                            enumerator.close_async(GLib.PRIORITY_DEFAULT, null, null);
                            resolve(names);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            }
        );
    });
}

function openReadWrite(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.open_readwrite_async(GLib.PRIORITY_DEFAULT, cancellable, (_file, result) => {
            try {
                resolve(file.open_readwrite_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function writeAll(stream, bytes, cancellable) {
    return new Promise((resolve, reject) => {
        stream.write_bytes_async(
            new GLib.Bytes(bytes),
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_stream, result) => {
            try {
                const written = stream.write_bytes_finish(result);
                if (written !== bytes.length)
                    throw new Error('Incomplete raw HID write');
                resolve();
            } catch (error) {
                reject(error);
            }
            }
        );
    });
}

function readReport(stream, cancellable) {
    return new Promise((resolve, reject) => {
        stream.read_bytes_async(
            REPORT_LENGTH,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_stream, result) => {
                try {
                    const response = stream.read_bytes_finish(result).get_data();
                    if (response.length === 0)
                        throw new Error('Raw HID device returned no data');
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export class HidController {
    constructor() {
        this._active = true;
        this._transfers = new Set();
        this._queue = Promise.resolve();
        this._restoreBrightness = DEFAULT_BRIGHTNESS;
        this._restoreEffect = DEFAULT_EFFECT;
    }

    destroy() {
        this._active = false;
        for (const cancellable of this._transfers)
            cancellable.cancel();
        this._transfers.clear();
        this._queue = Promise.resolve();
    }

    getState() {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            const state = await this._getStateAtPath(path);
            const info = await this._getDeviceInfoAtPath(path);
            return {...state, ...info};
        });
    }

    applyState(state) {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            await this._setValue(path, VALUE_BRIGHTNESS, state.brightness, 'brightness');
            await this._setValue(path, VALUE_SPEED, state.speed, 'effect speed');
            await this._setColor(path, state.hue, state.saturation);
            await this._setValue(path, VALUE_EFFECT, state.effect, 'effect');
            await this._request(path, [COMMAND_SAVE, RGB_MATRIX_CHANNEL], 'save');

            const applied = await this._getStateAtPath(path);
            for (const key of ['brightness', 'effect', 'speed', 'hue', 'saturation']) {
                const tolerance = key === 'brightness' ? 1 : 0;
                if (Math.abs(applied[key] - state[key]) > tolerance)
                    throw new Error(`Keyboard did not retain profile ${key}`);
            }
            return applied;
        });
    }

    toggle() {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            const brightness = await this._getValue(path, VALUE_BRIGHTNESS, 'brightness');
            const effect = await this._getValue(path, VALUE_EFFECT, 'effect');

            if (brightness > 0 && effect > 0) {
                this._restoreBrightness = brightness;
                this._restoreEffect = effect;
                await this._setValue(path, VALUE_EFFECT, 0, 'effect');
                return false;
            }

            await this._setValue(path, VALUE_BRIGHTNESS, this._restoreBrightness, 'brightness');
            await this._setValue(path, VALUE_EFFECT, this._restoreEffect, 'effect');
            return true;
        });
    }

    setBrightness(value) {
        return this._changeValue(VALUE_BRIGHTNESS, value, 'brightness');
    }

    setEffect(value) {
        return this._changeValue(VALUE_EFFECT, clamp(value, 0, EFFECT_MAX), 'effect');
    }

    adjustEffect(delta) {
        return this._adjustValue(VALUE_EFFECT, delta, 'effect', 0, EFFECT_MAX);
    }

    adjustSpeed(delta) {
        return this._adjustValue(VALUE_SPEED, delta, 'effect speed');
    }

    adjustHue(delta) {
        return this._adjustColor(delta, 0);
    }

    adjustSaturation(delta) {
        return this._adjustColor(0, delta);
    }

    save() {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            await this._request(path, [COMMAND_SAVE, RGB_MATRIX_CHANNEL], 'save');
        });
    }

    _changeValue(valueId, value, label) {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            return this._setValue(path, valueId, value, label);
        });
    }

    _adjustValue(valueId, delta, label, lower = 0, upper = 255) {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            const current = await this._getValue(path, valueId, label);
            return this._setValue(path, valueId, clamp(current + delta, lower, upper), label);
        });
    }

    _adjustColor(hueDelta, saturationDelta) {
        return this._enqueue(async () => {
            const path = await this._findDevice();
            const [hue, saturation] = await this._getColor(path);
            return this._setColor(path, hue + hueDelta, saturation + saturationDelta);
        });
    }

    _enqueue(operation) {
        if (!this._active)
            return Promise.reject(new Error('Raw HID controller is disabled'));

        const pending = this._queue.then(operation, operation);
        this._queue = pending.catch(() => {});
        return pending;
    }

    async _findDevice() {
        const cancellable = this._newCancellable();
        try {
            const names = await enumerateNames(
                Gio.File.new_for_path('/sys/class/hidraw'),
                cancellable
            );

            for (const name of names.sort()) {
                const base = `/sys/class/hidraw/${name}/device`;
                try {
                    const uevent = new TextDecoder().decode(await loadBytes(
                        Gio.File.new_for_path(`${base}/uevent`),
                        cancellable
                    ));
                    if (!uevent.split('\n').includes(HID_ID))
                        continue;

                    const descriptor = await loadBytes(
                        Gio.File.new_for_path(`${base}/report_descriptor`),
                        cancellable
                    );
                    if (VIA_DESCRIPTOR_PREFIX.every((byte, index) => descriptor[index] === byte))
                        return `/dev/${name}`;
                } catch (error) {
                    if (isCancelled(error))
                        throw error;
                }
            }
        } finally {
            this._releaseCancellable(cancellable);
        }

        throw new Error('Compatible VIA raw HID interface not found');
    }

    async _getValue(path, valueId, label) {
        const response = await this._request(
            path,
            [COMMAND_GET, RGB_MATRIX_CHANNEL, valueId],
            label
        );
        return response[3];
    }

    async _getStateAtPath(path) {
        const brightness = await this._getValue(path, VALUE_BRIGHTNESS, 'brightness');
        const effect = await this._getValue(path, VALUE_EFFECT, 'effect');
        const speed = await this._getValue(path, VALUE_SPEED, 'effect speed');
        const [hue, saturation] = await this._getColor(path);

        if (brightness > 0)
            this._restoreBrightness = brightness;
        if (effect > 0)
            this._restoreEffect = effect;

        return {brightness, effect, speed, hue, saturation};
    }

    async _getDeviceInfoAtPath(path) {
        let protocolVersion = null;
        let firmwareVersion = null;

        try {
            const response = await this._request(
                path,
                [COMMAND_GET_PROTOCOL_VERSION],
                'protocol version'
            );
            protocolVersion = (response[1] << 8) | response[2];
        } catch {
            // Lighting remains compatible with older firmware lacking this query.
        }

        try {
            const response = await this._request(
                path,
                [COMMAND_GET_KEYBOARD_VALUE, KEYBOARD_VALUE_FIRMWARE_VERSION],
                'firmware version'
            );
            firmwareVersion = (
                (response[2] * 0x1000000) +
                (response[3] << 16) +
                (response[4] << 8) +
                response[5]
            ) >>> 0;
        } catch {
            // VIA firmware versions are optional and commonly report no value.
        }

        return {protocolVersion, firmwareVersion};
    }

    async _getColor(path) {
        const response = await this._request(
            path,
            [COMMAND_GET, RGB_MATRIX_CHANNEL, VALUE_COLOR],
            'color'
        );
        return [response[3], response[4]];
    }

    async _setValue(path, valueId, value, label) {
        const upper = valueId === VALUE_BRIGHTNESS ? BRIGHTNESS_MAX : 255;
        const bounded = clamp(value, 0, upper);
        // QMK's RGB Matrix protocol scales an incoming 0..255 brightness byte.
        // On this K5 Pro, compensating by one preserves the value read back and
        // prevents a profile from becoming dimmer on every application.
        const encoded = valueId === VALUE_BRIGHTNESS && bounded > 0
            ? Math.min(255, bounded + 1)
            : bounded;
        await this._request(
            path,
            [COMMAND_SET, RGB_MATRIX_CHANNEL, valueId, encoded],
            label
        );
        return bounded;
    }

    async _setColor(path, hue, saturation) {
        const boundedHue = clamp(hue);
        const boundedSaturation = clamp(saturation);
        await this._request(
            path,
            [COMMAND_SET, RGB_MATRIX_CHANNEL, VALUE_COLOR, boundedHue, boundedSaturation],
            'color'
        );
        return [boundedHue, boundedSaturation];
    }

    async _request(path, payload, label) {
        const request = new Uint8Array(REPORT_LENGTH);
        request.set(payload.slice(0, REPORT_LENGTH));

        const cancellable = this._newCancellable();
        let ioStream = null;
        let timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            TRANSFER_TIMEOUT_MS,
            () => {
                timeoutId = 0;
                cancellable.cancel();
                return GLib.SOURCE_REMOVE;
            }
        );

        try {
            ioStream = await openReadWrite(Gio.File.new_for_path(path), cancellable);
            await writeAll(ioStream.get_output_stream(), request, cancellable);
            const response = await readReport(ioStream.get_input_stream(), cancellable);
            if (response[0] === COMMAND_UNHANDLED)
                throw new Error(`Keyboard firmware rejected VIA RGB ${label}`);
            return response;
        } catch (error) {
            if (isCancelled(error) && this._active)
                throw new Error(`VIA raw HID ${label} request timed out`);
            throw error;
        } finally {
            if (timeoutId)
                GLib.Source.remove(timeoutId);
            ioStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
            this._releaseCancellable(cancellable);
        }
    }

    _newCancellable() {
        const cancellable = new Gio.Cancellable();
        if (!this._active)
            cancellable.cancel();
        this._transfers.add(cancellable);
        return cancellable;
    }

    _releaseCancellable(cancellable) {
        this._transfers.delete(cancellable);
    }
}

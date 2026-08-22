// SPDX-License-Identifier: GPL-3.0-or-later

import {HidController} from '../hid.js';

const hid = new HidController();
try {
    const state = await hid.getState();
    console.log(JSON.stringify({operation: 'read', state}));

    if (ARGV.includes('--round-trip')) {
        const brightnessArgument = ARGV.find(argument => argument.startsWith('--brightness='));
        const brightness = brightnessArgument
            ? Number.parseInt(brightnessArgument.split('=')[1], 10)
            : state.brightness;
        const verified = await hid.applyState({
            brightness,
            effect: state.effect,
            speed: state.speed,
            hue: state.hue,
            saturation: state.saturation,
        });
        console.log(JSON.stringify({operation: 'write-save-read', state: verified}));
    }
} finally {
    hid.destroy();
}

// SPDX-License-Identifier: GPL-3.0-or-later

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {KeyboardController} from './controller.js';

export default class KeyboardControlsExtension extends Extension {
    enable() {
        this._controller = new KeyboardController(this);
        this._controller.enable();
    }

    disable() {
        this._controller.destroy();
        this._controller = null;
    }
}

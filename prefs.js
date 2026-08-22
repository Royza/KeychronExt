// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    normalizeProfileNames,
    normalizeProfileValues,
    PROFILE_COUNT,
} from './profile.js';

export default class KeyboardControlsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Lighting Profiles',
            icon_name: 'input-keyboard-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Lighting Profiles',
            description: 'Capture or apply profiles from the panel menu. Rename and clear them here.',
        });

        const names = normalizeProfileNames(settings.get_strv('profile-names'));
        const values = normalizeProfileValues(settings.get_strv('profile-values'));

        for (let index = 0; index < PROFILE_COUNT; index++) {
            const row = new Adw.EntryRow({
                title: index === 0 ? 'Default profile name' : `Profile ${index + 1} name`,
                text: names[index],
                editable: index !== 0,
            });
            const status = new Gtk.Label({
                label: values[index] ? 'Saved' : 'Empty',
                css_classes: ['dim-label'],
            });
            row.add_suffix(status);

            if (index !== 0) {
                const clearButton = new Gtk.Button({
                    icon_name: 'edit-clear-symbolic',
                    tooltip_text: 'Clear this profile',
                    valign: Gtk.Align.CENTER,
                    sensitive: Boolean(values[index]),
                });
                clearButton.connect('clicked', () => {
                    const currentValues = normalizeProfileValues(
                        settings.get_strv('profile-values')
                    );
                    currentValues[index] = '';
                    settings.set_strv('profile-values', currentValues);
                    status.label = 'Empty';
                    clearButton.sensitive = false;
                });
                row.add_suffix(clearButton);

                row.connect('changed', () => {
                    const currentNames = normalizeProfileNames(
                        settings.get_strv('profile-names')
                    );
                    currentNames[index] = row.text;
                    settings.set_strv('profile-names', normalizeProfileNames(currentNames));
                });
            }

            group.add(row);
        }

        page.add(group);
        window.add(page);
    }
}

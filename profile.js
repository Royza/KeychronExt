// SPDX-License-Identifier: GPL-3.0-or-later

export const PROFILE_COUNT = 10;
export const PROFILE_VERSION = 1;
export const DEFAULT_PROFILE_NAMES = Object.freeze([
    'Default',
    'Profile 2',
    'Profile 3',
    'Profile 4',
    'Profile 5',
    'Profile 6',
    'Profile 7',
    'Profile 8',
    'Profile 9',
    'Profile 10',
]);

function isByte(value) {
    return Number.isInteger(value) && value >= 0 && value <= 255;
}

export function normalizeProfileNames(names) {
    return DEFAULT_PROFILE_NAMES.map((fallback, index) => {
        if (index === 0)
            return fallback;

        const name = typeof names?.[index] === 'string' ? names[index].trim() : '';
        return name.slice(0, 40) || fallback;
    });
}

export function normalizeProfileValues(values) {
    return Array.from({length: PROFILE_COUNT}, (_unused, index) =>
        typeof values?.[index] === 'string' ? values[index] : '');
}

export function parseProfile(serialized) {
    if (!serialized)
        return null;

    try {
        const profile = JSON.parse(serialized);
        if (profile.version !== PROFILE_VERSION || profile.model !== 'K5 Pro')
            return null;
        if (!isByte(profile.brightness) ||
            !Number.isInteger(profile.effect) || profile.effect < 0 || profile.effect > 24 ||
            !isByte(profile.speed) || !isByte(profile.hue) || !isByte(profile.saturation))
            return null;

        return {
            version: PROFILE_VERSION,
            model: 'K5 Pro',
            brightness: profile.brightness,
            effect: profile.effect,
            speed: profile.speed,
            hue: profile.hue,
            saturation: profile.saturation,
        };
    } catch {
        return null;
    }
}

export function serializeProfile(state) {
    const profile = parseProfile(JSON.stringify({
        version: PROFILE_VERSION,
        model: 'K5 Pro',
        brightness: state.brightness,
        effect: state.effect,
        speed: state.speed,
        hue: state.hue,
        saturation: state.saturation,
    }));
    if (!profile)
        throw new Error('Lighting state cannot be stored as a profile');

    return JSON.stringify(profile);
}

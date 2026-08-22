// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';

import {
    normalizeProfileNames,
    normalizeProfileValues,
    parseProfile,
    serializeProfile,
} from '../profile.js';

const state = {brightness: 175, effect: 1, speed: 128, hue: 32, saturation: 255};
const serialized = serializeProfile(state);
assert.deepEqual(parseProfile(serialized), {version: 1, model: 'K5 Pro', ...state});
assert.equal(parseProfile('{"version":1,"model":"Other"}'), null);
assert.equal(parseProfile('{broken'), null);
assert.equal(parseProfile(serializeProfile({...state, effect: 24})).effect, 24);
assert.throws(() => serializeProfile({...state, effect: 25}));
assert.equal(normalizeProfileNames(['Wrong', '  Work  '])[0], 'Default');
assert.equal(normalizeProfileNames(['Default', '  Work  '])[1], 'Work');
assert.equal(normalizeProfileValues(['one']).length, 10);

console.log('profile tests passed');

export default [
    {
        files: ['extension.js', 'controller.js', 'hid.js', 'prefs.js', 'profile.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                global: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            'eqeqeq': 'error',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
        },
    },
];

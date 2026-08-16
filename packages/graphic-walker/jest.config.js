/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                diagnostics: {
                    ignoreCodes: [1343],
                },
            },
        ],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^nanoid$': '<rootDir>/tests/shims/nanoid.cjs',
        '^d3-format$': '<rootDir>/../../node_modules/d3-format/dist/d3-format.js',
        '^@/constants$': '<rootDir>/tests/shims/constants.cjs',
        // Map `../constants` / `../../constants` only — never `./constants`,
        // which would intercept picomatch's own `require('./constants')`.
        '^(\\.\\./)+constants$': '<rootDir>/tests/shims/constants.cjs',
    },
    testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/tests/e2e/'],
};

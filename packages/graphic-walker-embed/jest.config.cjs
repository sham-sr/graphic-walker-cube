/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['<rootDir>/dist/'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    module: 'commonjs',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    strict: true,
                    skipLibCheck: true,
                },
            },
        ],
    },
    moduleNameMapper: {
        '^@kanaries/graphic-walker$': '<rootDir>/tests/shims/graphic-walker.cjs',
    },
};

export default {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/apps/api',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        // Relative imports still typecheck the real Solana.ts; skip diagnostics
        // there so Kit package-exports don't break the suite.
        diagnostics: {
          exclude: ['**/modules/chains/Solana.ts'],
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    // Runtime: never load Kit / subscriptions during unit tests.
    '^.+/chains/Solana$': '<rootDir>/src/__tests__/mocks/Solana.ts',
  },
};

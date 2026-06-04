// Jest config for the Expo/React Native app.
//
// Uses the official `jest-expo` preset (handles the RN/Expo babel transform
// and native-module mocks). Our current tests are deliberately render-free —
// pure helpers + the axios client with its native Storage dependency mocked —
// so they run fast and don't need the full component/native surface.
module.exports = {
  preset: 'jest-expo',
  // Resolve the `@/…` path alias the same way tsconfig does.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Only pick up our test files; never traverse node_modules.
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
};

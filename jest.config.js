module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: './coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/types/**/*.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/mocks/vscode.ts'
  }
};

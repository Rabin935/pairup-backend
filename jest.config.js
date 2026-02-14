module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/_test_/integration/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/_test_/**",
    "!src/index.ts",
    "!src/app.ts",
  ],
  setupFilesAfterEnv: ["<rootDir>/src/_test_/setup.ts"],
  moduleNameMapper: {
    "^uuid$": "<rootDir>/src/_test_/_mocks_/uuid.js",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  testTimeout: 10000,
};

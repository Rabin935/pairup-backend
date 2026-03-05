module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/_test_/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/error/http-error.ts",
    "src/middleware/authorized.middleware.ts",
    "src/repositories/user.repository.ts",
    "src/utils/message-moderation.ts",
    "src/utils/rate-limit.ts",
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

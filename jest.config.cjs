/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.js"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
  },
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)",
    "**/?(*.)+(spec|test).[jt]s?(x)",
  ],
  moduleFileExtensions: ["js", "jsx", "ts", "tsx", "json"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
  },
  // Coverage includes AuthContext, route protection (ProtectedRoute, App), messaging (AppPage, socket)
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/main.tsx",
    "!src/main.jsx",
    "!src/**/*.d.ts",
    "!src/setupTests.js",
    "!src/vite-env.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "html"],
  coveragePathIgnorePatterns: ["/node_modules/", "/__tests__/"],
};

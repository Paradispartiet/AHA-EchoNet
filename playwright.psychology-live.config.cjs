const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/live",
  testMatch: "aha-psychology-production.spec.cjs",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium-production", use: { ...devices["Desktop Chrome"] } },
    { name: "ipad-webkit-production", use: { ...devices["iPad Pro 11"], browserName: "webkit" } }
  ]
});

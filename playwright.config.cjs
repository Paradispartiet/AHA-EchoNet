const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/browser",
  timeout: 8 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium-corpus", use: { ...devices["Desktop Chrome"] } },
    { name: "ipad-webkit", use: { ...devices["iPad Pro 11"], browserName: "webkit" } }
  ],
  webServer: {
    command: "node scripts/serve-static-for-tests.mjs",
    url: "http://127.0.0.1:4177/projection-product-review-v2.html",
    reuseExistingServer: true,
    timeout: 30000
  }
});

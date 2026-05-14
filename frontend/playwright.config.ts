import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }]],

  expect: {
    toHaveScreenshot: {
      // 2% pixel tolerance — handles sub-pixel font rendering differences
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },

  use: {
    baseURL: process.env.BASE_URL || "https://centricore.ru",
    trace: "on-first-retry",
  },

  projects: [
    // Step 1: login and save auth state
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
    },

    // Step 2: visual tests on desktop — reuse saved auth
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: "e2e/.auth/user.json",
        colorScheme: "light",
      },
      testMatch: "**/visual.spec.ts",
    },

    // Step 3: same tests on mobile
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["iPhone 14"],
        storageState: "e2e/.auth/user.json",
        colorScheme: "light",
        ignoreHTTPSErrors: true,
      },
      testMatch: "**/visual.spec.ts",
    },
  ],

});

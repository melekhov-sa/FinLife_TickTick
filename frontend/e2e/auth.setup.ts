import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_EMAIL and TEST_PASSWORD must be set in e2e/.env.test.local\n" +
      "Copy e2e/.env.test.local.example → e2e/.env.test.local and fill in credentials."
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard after successful login
  await page.waitForURL("**/dashboard", { timeout: 20_000 });

  // Wait for the app to fully load (no spinning loaders)
  await page.waitForFunction(
    () => !document.querySelector(".animate-spin"),
    { timeout: 15_000 }
  );

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });

  console.log("✓ Auth state saved to", authFile);
});

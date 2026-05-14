import { test, expect, type Page } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for React Query data to load: no spinners, network idle. */
async function waitForReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(() => !document.querySelector(".animate-spin"), {
      timeout: 15_000,
    })
    .catch(() => {
      // If spinner never disappears — continue anyway, test will show what loaded
    });
  // Small pause for CSS transitions to finish
  await page.waitForTimeout(300);
}

/**
 * Locators to mask in every screenshot — dynamic content that changes
 * daily (date in topbar, real-time values).
 */
function dynamicMasks(page: Page) {
  return [
    // Date in AppTopbar ("14 мая 2026 г.")
    page.locator("header .text-\\[10px\\]"),
  ];
}

// ── Pages ─────────────────────────────────────────────────────────────────────

test("dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("dashboard.png", {
    fullPage: true,
    mask: dynamicMasks(page),
  });
});

test("plan", async ({ page }) => {
  await page.goto("/plan");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("plan.png", { fullPage: true });
});

test("events", async ({ page }) => {
  await page.goto("/events");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("events.png", { fullPage: true });
});

test("money", async ({ page }) => {
  await page.goto("/money");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("money.png", { fullPage: true });
});

test("wallets", async ({ page }) => {
  await page.goto("/wallets");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("wallets.png", { fullPage: true });
});

test("budget", async ({ page }) => {
  await page.goto("/budget");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("budget.png", { fullPage: true });
});

test("habits", async ({ page }) => {
  await page.goto("/habits");
  await waitForReady(page);
  await expect(page).toHaveScreenshot("habits.png", { fullPage: true });
});

// ── Key modals ────────────────────────────────────────────────────────────────

test("modal: create task", async ({ page }) => {
  await page.goto("/dashboard");
  await waitForReady(page);

  // Open via MobileNav FAB (mobile) or trigger from page
  // Desktop: find "+ Создать" or equivalent button
  // We trigger via URL param if available, otherwise click
  await page.evaluate(() => {
    // Dispatch custom event that MobileNav listens to, or just look for button
  });

  // Click the FAB / create button — adjust selector if needed
  const fab = page.locator('[aria-label*="задач"], [aria-label*="создат"]').first();
  if (await fab.isVisible()) {
    await fab.click();
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot("modal-create-task.png");
  }
});

test("modal: create operation", async ({ page }) => {
  await page.goto("/money");
  await waitForReady(page);

  // Find the create operation button
  const btn = page.getByRole("button", { name: /создать|расход|доход|операц/i }).first();
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot("modal-create-operation.png");
  }
});

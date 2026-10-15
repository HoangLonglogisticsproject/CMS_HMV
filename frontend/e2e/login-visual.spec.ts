import { expect, test } from "@playwright/test";

test.describe("Login Visual & Single-Viewport Layout Parity", () => {
  // 1. Reference Viewport 1672x941
  test("renders login page at reference 1672x941 viewport with design parity landmarks and zero scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto("/login", { waitUntil: "networkidle" });

    // Wait for document fonts and images to be fully hydrated
    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    });

    // Disable CSS animations for deterministic visual stability
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });

    // Zero-scroll assertion: page must fit cleanly in single viewport
    const scrollMetrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY,
    }));
    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    expect(scrollMetrics.scrollY).toBe(0);

    // 1. Verify Left Brand Hero Logo (large hero sizing)
    const leftLogo = page.locator("#left-brand-header img");
    await expect(leftLogo).toBeVisible();
    const logoBox = await leftLogo.boundingBox();
    expect(logoBox).not.toBeNull();
    if (logoBox) {
      expect(logoBox.x).toBeCloseTo(80, -1);
      expect(logoBox.y).toBeLessThanOrEqual(55);
      expect(logoBox.width).toBeGreaterThanOrEqual(300);
    }

    // 2. Verify Metadata Label & Divider
    const metaLabel = page.locator("#metadata-label");
    await expect(metaLabel).toContainText(/Internal Workspace/i);
    await expect(metaLabel).toContainText(/Enterprise CMS/i);

    // 3. Verify Main Headline (~30-35% viewport height ~305-315px)
    const headline = page.locator("#main-headline");
    await expect(headline).toBeVisible();
    const headlineBox = await headline.boundingBox();
    expect(headlineBox).not.toBeNull();
    if (headlineBox) {
      expect(headlineBox.x).toBeCloseTo(80, -1);
      expect(headlineBox.y).toBeGreaterThanOrEqual(300);
      expect(headlineBox.y).toBeLessThanOrEqual(330);
    }

    // 4. Verify 4 Industry Context Row items on single horizontal line
    const industryRow = page.locator("#industry-context-row");
    await expect(industryRow).toBeVisible();
    await expect(industryRow).toContainText("Nông nghiệp");
    await expect(industryRow).toContainText("Thương mại");
    await expect(industryRow).toContainText("Logistics");
    await expect(industryRow).toContainText("Kết nối");

    // 5. Verify Editorial Footer at bottom of viewport
    const editorialFooter = page.locator("#editorial-footer");
    await expect(editorialFooter).toBeVisible();
    const footerBox = await editorialFooter.boundingBox();
    expect(footerBox).not.toBeNull();
    if (footerBox) {
      expect(footerBox.y).toBeGreaterThan(800);
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }

    // 6. Verify Right Floating Login Card (w=570px, offset=64px, y=82px)
    const card = page.locator("#right-login-card");
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    if (cardBox) {
      expect(cardBox.width).toBeCloseTo(570, -1);
      expect(cardBox.x).toBeCloseTo(1038, -1);
      expect(cardBox.y).toBeCloseTo(82, -1);
      expect(cardBox.height).toBeGreaterThanOrEqual(800);
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }

    // 7. Verify Inputs and Submit button heights (52px)
    const emailInput = page.getByLabel("Email");
    const passwordInput = page.getByLabel("Mật khẩu");
    const submitBtn = page.getByRole("button", { name: "Đăng nhập" });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    const emailBox = await emailInput.boundingBox();
    const submitBox = await submitBtn.boundingBox();
    if (emailBox) expect(emailBox.height).toBe(52);
    if (submitBox) expect(submitBox.height).toBe(52);
  });

  // 2. User Actual Browser Viewport 1659x848 (Zero Scroll)
  test("renders login page on user actual browser viewport 1659x848 without scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1659, height: 848 });
    await page.goto("/login", { waitUntil: "networkidle" });

    const scrollMetrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY,
    }));

    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    expect(scrollMetrics.scrollY).toBe(0);

    // Verify all key landmarks are visible inside viewport
    const leftLogo = page.locator("#left-brand-header img");
    const card = page.locator("#right-login-card");
    const footer = page.locator("#editorial-footer");
    const security = page.locator("#card-security-footer");

    await expect(leftLogo).toBeVisible();
    await expect(card).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(security).toBeVisible();

    const cardBox = await card.boundingBox();
    const footerBox = await footer.boundingBox();
    if (cardBox) {
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }
    if (footerBox) {
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }
  });

  // 3. Standard Laptop Viewport 1366x768 (Zero Scroll)
  test("renders login page on standard laptop viewport 1366x768 without scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/login", { waitUntil: "networkidle" });

    const scrollMetrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY,
    }));

    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);

    const card = page.locator("#right-login-card");
    const footer = page.locator("#editorial-footer");
    await expect(card).toBeVisible();
    await expect(footer).toBeVisible();

    const cardBox = await card.boundingBox();
    const footerBox = await footer.boundingBox();
    if (cardBox) {
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }
    if (footerBox) {
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
    }
  });

  // 4. Error State on User Viewport 1659x848 (Zero Scroll)
  test("maintains zero scroll when authentication validation error is displayed", async ({ page }) => {
    await page.setViewportSize({ width: 1659, height: 848 });
    await page.goto("/login", { waitUntil: "networkidle" });

    await page.fill("#login-email", "invalid@hmvglobal.com");
    await page.fill("#login-password", "wrongpassword");
    await page.click("button[type='submit']");

    const errorAlert = page.locator("div[role='alert']");
    await expect(errorAlert).toBeVisible({ timeout: 5000 });

    const scrollMetrics = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));

    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
  });

  // 5. Mobile Viewport 390x844
  test("renders accessible login form on mobile viewport 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login", { waitUntil: "networkidle" });

    const emailInput = page.getByLabel("Email");
    const passwordInput = page.getByLabel("Mật khẩu");
    const submitBtn = page.getByRole("button", { name: "Đăng nhập" });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    const emailBox = await emailInput.boundingBox();
    if (emailBox) {
      expect(emailBox.height).toBe(52);
    }
  });
});

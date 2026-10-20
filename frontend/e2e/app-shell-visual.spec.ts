import { test, expect } from "@playwright/test";
import { loginViaUi } from "./helpers";
import path from "path";
import { ACTIVE_NAVIGATION_GROUPS, ROADMAP_FEATURES, TARGET_NAVIGATION_IA } from "../src/config/navigation";
import fs from "fs";

// What the E2E editor holds (EDITOR role); nav items behind other permissions are hidden for it.
const EDITOR_PERMISSIONS = ["article:read", "article:write", "media:read", "media:write", "page:read", "page:write"];

const ARTIFACT_DIR = "C:/Users/ACER/.gemini/antigravity-ide/brain/41a6b2dd-79f1-4d9c-a715-5e0275100df0";

test.describe("App Shell & Interaction Refinement Final Acceptance Audit", () => {
  test("1. Route Audit: Verify navigation.ts active routes exist, return 200, zero 404s, and distinguish roadmap", async ({
    page,
  }) => {
    await loginViaUi(page, "editor", "/");

    // A. Verify that active navigation groups only contain routes with physical page files
    const activeItems = ACTIVE_NAVIGATION_GROUPS.flatMap((g) => g.items);
    expect(activeItems.length).toBeGreaterThan(0);

    for (const item of activeItems) {
      expect(item.isActiveRoute).toBe(true);

      // Verify physical Next.js page route file exists in src/app
      const routeSegment = item.href === "/" ? "" : item.href.replace(/^\//, "");
      const physicalPagePath = path.join(process.cwd(), "src/app", routeSegment, "page.tsx");
      expect(fs.existsSync(physicalPagePath)).toBe(true);

      // Navigate and verify HTTP 200 and no 404
      const response = await page.goto(item.href);
      expect(response?.status()).toBe(200);
      await expect(page.locator("body")).not.toContainText("404");
      await expect(page.locator("body")).not.toContainText("This page could not be found");

      // Verify active indicator in sidebar
      const activeLink = page.locator("aside").getByRole("link", { name: item.title });
      if (item.permission && !EDITOR_PERMISSIONS.includes(item.permission)) {
        // Permission-gated route (e.g. user management): an editor reaches the page but gets no sidebar entry.
        await expect(activeLink).toHaveCount(0);
        continue;
      }
      await expect(activeLink).toBeVisible();
      await expect(activeLink).toHaveClass(/bg-\[#E9F7FF\]/);
    }

    // B. Verify that roadmap items are NOT in active navigation
    const activeHrefs = new Set(activeItems.map((i) => i.href));
    for (const roadmap of ROADMAP_FEATURES) {
      expect(activeHrefs.has(roadmap.plannedRoute)).toBe(false);
    }
  });

  test("2. Viewport 1440x900 & 1366x768 Audit: Dashboard, Pages, and Supply Chain Studio", async ({ page }) => {
    // === A. Viewport 1440x900 ===
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "editor", "/");
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();

    // Verify Brand Lockup
    await expect(page.locator("aside").getByText("HMV Global")).toBeVisible();
    await expect(page.locator("aside").getByText("Content Workspace")).toBeVisible();

    // Capture: Dashboard 1440x900
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_app_shell_1440x900.png"),
      fullPage: false,
    });

    // Capture: Sidebar expanded 1440
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sidebar_expanded_1440.png"),
      clip: { x: 0, y: 0, width: 320, height: 900 },
    });

    // Test Collapse Rail
    const collapseBtn = page.getByRole("button", { name: "Thu gọn thanh điều hướng" });
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // Verify rail width
    const railBox = await page.locator("aside").boundingBox();
    expect(railBox?.width).toBeLessThanOrEqual(72);
    expect(railBox?.width).toBeGreaterThanOrEqual(64);

    // Capture: Sidebar collapsed 1440
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sidebar_collapsed_1440.png"),
      fullPage: false,
    });

    // Re-expand
    await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();
    await page.waitForTimeout(300);

    // Pages Listing 1440x900
    await page.goto("/content/pages");
    await expect(page.getByRole("heading", { name: "Trang website & Landing Pages" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Biên tập" }).first()).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "pages_listing_1440x900.png"),
      fullPage: false,
    });

    // Supply Chain Studio 1440x900
    await page.goto("/supply-chain/stages");
    await expect(page.getByRole("heading", { name: "Hành trình chuỗi cung ứng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xem trước", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu bản nháp" })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "supply_chain_studio_1440x900.png"),
      fullPage: false,
    });

    // === B. Viewport 1366x768 (Standard Laptop) ===
    await page.setViewportSize({ width: 1366, height: 768 });

    // Dashboard 1366x768
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_app_shell_1366x768.png"),
      fullPage: false,
    });

    // Pages Listing 1366x768
    await page.goto("/content/pages");
    await expect(page.getByRole("heading", { name: "Trang website & Landing Pages" })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "pages_listing_1366x768.png"),
      fullPage: false,
    });

    // Supply Chain Studio 1366x768
    await page.goto("/supply-chain/stages");
    await expect(page.getByRole("heading", { name: "Hành trình chuỗi cung ứng" })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "supply_chain_studio_1366x768.png"),
      fullPage: false,
    });
  });

  test("3. Mobile Navigation Drawer (390x844): Touch and Sheet UX", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, "editor", "/");

    // Open mobile hamburger sheet
    const mobileBtn = page.getByRole("button", { name: "Mở thanh điều hướng" });
    await expect(mobileBtn).toBeVisible();
    await mobileBtn.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("HMV Global")).toBeVisible();
    await expect(drawer.getByText("Hành trình chuỗi cung ứng")).toBeVisible();

    // Capture: Mobile drawer 390x844
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile_drawer_390x844.png"),
      fullPage: false,
    });

    // Close on navigation
    await drawer.getByRole("link", { name: "EcoNews" }).click();
    await expect(page).toHaveURL(/\/content\/articles$/);
    await expect(drawer).not.toBeVisible();
  });

  test("4. Header & Account Dropdown Visual Verification (No Quick Logout)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "editor", "/");

    // 1. Verify Quick Logout button is completely absent from header
    await expect(page.locator("header").getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);

    // 2. Capture Header state without quick logout button
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "header_new_no_quick_logout.png"),
      clip: { x: 0, y: 0, width: 1440, height: 70 },
    });

    // 3. Click Account Menu Trigger (avatar or name)
    const trigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // 4. Verify Account Dropdown Menu is visible with single logout action
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Đăng xuất" })).toBeVisible();

    // 5. Capture Header with Account Dropdown open
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "header_account_dropdown_open.png"),
      clip: { x: 1000, y: 0, width: 440, height: 260 },
    });

    // Close desktop dropdown before switching to mobile
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();

    // 6. Mobile Viewport 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileTrigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await expect(mobileTrigger).toBeVisible();
    await mobileTrigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "header_mobile_account_dropdown.png"),
      clip: { x: 0, y: 0, width: 390, height: 260 },
    });
  });

  test("5. Admin account dropdown shows the session's own name, email and role", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "editor", "/");

    // Mocked admin session (test identity, never a real account)
    await page.route("**/api/v1/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "admin-uuid-001",
            email: "admin@e2e.test",
            displayName: "Quản Trị Viên",
            roles: ["ADMIN"],
            permissions: ["article:archive", "article:publish", "article:read", "article:review", "article:write", "media:read", "media:write", "page:publish", "page:read", "page:review", "page:write", "user:manage"],
          },
          csrfToken: "mock-admin-csrf-token",
        }),
      });
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();


    // Trigger shows the session's initials, name and role
    const trigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await expect(trigger).toBeVisible();
    await expect(trigger.getByText("QV")).toBeVisible();
    await expect(trigger.getByText("Quản Trị Viên")).toBeVisible();
    await expect(trigger.getByText("ADMIN", { exact: true })).toBeVisible();


    // Verify Quick Logout button is NOT present in Header
    await expect(page.locator("header").getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);

    // Capture Header bar in admin state
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "header_admin_no_quick_logout.png"),
      clip: { x: 0, y: 0, width: 1440, height: 70 },
    });

    // Open Account Dropdown
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // Verify structure exactly as required by user
    await expect(menu.getByText("Quản Trị Viên")).toBeVisible();
    await expect(menu.getByText("admin@e2e.test")).toBeVisible();
    await expect(menu.getByText("ADMIN", { exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Đăng xuất" })).toBeVisible();

    // Capture open Account Dropdown
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "header_admin_account_dropdown.png"),
      clip: { x: 1000, y: 0, width: 440, height: 260 },
    });
  });
});


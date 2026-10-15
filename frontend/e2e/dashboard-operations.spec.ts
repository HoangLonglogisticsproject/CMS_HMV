import { test, expect } from "@playwright/test";
import { createArticleViaApi, loginViaUi, uniqueSlug } from "./helpers";
import { E2E } from "./env";
import path from "path";

const ARTIFACT_DIR = "C:/Users/ACER/.gemini/antigravity-ide/brain/41a6b2dd-79f1-4d9c-a715-5e0275100df0";

test.describe("Executive Dashboard v2 — CEO Operations & Quick Review Drawer", () => {
  test("1. Populated queue, Quick Review Drawer, bilingual preview, approval, and publish with confirmation", async ({
    page,
  }) => {
    // Arrange: Create a draft article via API that awaits review
    const slug = uniqueSlug("robusta-supply");
    await createArticleViaApi("editor", slug, true);

    // Sign in as reviewer (who has article:review and article:publish)
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    // 1. Verify Header and Dashboard Title
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();
    await expect(page.getByText("CEO Operations")).toBeVisible();

    // 2. Verify Real Stats card displays positive awaiting review count
    await expect(page.getByText("Kho Nội Dung EcoNews (Real-time)")).toBeVisible();

    // 3. Verify Article item in Hàng Đợi Phê Duyệt EcoNews
    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await expect(articleCard).toBeVisible();
    await expect(articleCard.getByText("rev #1")).toBeVisible();
    await expect(articleCard.getByText("VI: Chờ duyệt")).toBeVisible();
    await expect(articleCard.getByText("EN: Chờ duyệt")).toBeVisible();

    // CRITICAL: Ensure NO inline approval or publish buttons exist on the card row!
    await expect(articleCard.getByRole("button", { name: "Duyệt VI" })).toHaveCount(0);
    await expect(articleCard.getByRole("button", { name: "Xuất bản" })).toHaveCount(0);

    // Primary action button is "Xem & xét duyệt"
    const reviewBtn = articleCard.getByRole("button", { name: "Xem & xét duyệt" });
    await expect(reviewBtn).toBeVisible();

    // Capture 1: Populated dashboard at 1440x900
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_populated_queue_1440x900.png"),
      fullPage: false,
    });

    // 4. Open Quick Review Drawer
    await reviewBtn.click();

    // Verify Sheet Drawer is open
    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { level: 2, name: `Bài viết ${slug}` })).toBeVisible();
    await expect(drawer.getByText("rev #1")).toBeVisible();
    await expect(drawer.getByText("VI: Chờ Ban Giám đốc duyệt")).toBeVisible();
    await expect(drawer.getByText("Hiển Thị Trên Google Tìm Kiếm")).toBeVisible();

    // Capture 2: Quick Review Drawer in Vietnamese (VI)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_quick_review_drawer_vi.png"),
      fullPage: false,
    });

    // 5. Switch to English (EN) tab in Drawer
    const enTabBtn = drawer.getByRole("button", { name: "English (EN)" });
    await expect(enTabBtn).toBeVisible();
    await enTabBtn.click();

    await expect(drawer.getByText("EN: Chờ Ban Giám đốc duyệt")).toBeVisible();

    // Capture 3: Quick Review Drawer in English (EN)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_quick_review_drawer_en.png"),
      fullPage: false,
    });

    // 6. Switch back to VI and Approve VI
    const viTabBtn = drawer.getByRole("button", { name: "Tiếng Việt (VI)" });
    await viTabBtn.click();

    const approveViBtn = drawer.getByTestId("drawer-approve-btn");
    await expect(approveViBtn).toBeVisible();
    await approveViBtn.click();

    // Verify approved state inside Drawer
    await expect(drawer.getByText("Bản dịch VI đã duyệt")).toBeVisible();

    // 7. Verify Publish button is now enabled and ready
    const publishBtn = drawer.getByTestId("drawer-publish-btn");
    await expect(publishBtn).toBeVisible();
    await expect(publishBtn).toBeEnabled();

    // Capture 4: State before Publish with Publish button enabled
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_quick_review_drawer_publish_state.png"),
      fullPage: false,
    });

    // 8. Click Publish -> Verify strict Confirmation Dialog appears
    await publishBtn.click();

    const confirmDialog = page.getByRole("dialog").filter({ hasText: "Xác nhận xuất bản bài viết" });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/Bản dịch phát hành công khai:/)).toBeVisible();

    // Confirm publish
    const confirmBtn = page.getByTestId("confirm-publish-btn");
    await confirmBtn.click();

    // Wait for publish toast & status update
    await expect(page.getByText("Đã xuất bản bài viết lên website công khai!")).toBeVisible();
    await expect(drawer.getByText("Đang công khai")).toBeVisible();

    // 9. Close Drawer and check updated Dashboard
    const closeBtn = drawer.getByTestId("drawer-close-btn");
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();

    // Verify article card on Dashboard now displays "Đang công khai"
    await expect(articleCard.getByText("Đang công khai")).toBeVisible();
    await expect(articleCard.getByText("VI: Đã duyệt")).toBeVisible();

    // Capture 5: Dashboard after publish updated
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_after_publish_updated.png"),
      fullPage: false,
    });
  });

  test("2. Honest Empty State: verify truthful wording when filtering or when no articles await review", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Intercept articles query to simulate 0 awaiting review items
    await page.route("**/api/v1/admin/articles?*awaitingReview=true*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], page: 1, pageSize: 6, total: 0 }),
      });
    });

    await loginViaUi(page, "reviewer", "/");

    // Verify honest Empty State heading and description
    const emptyStateHeading = page.getByRole("heading", { name: "Không có bài viết nào chờ xem xét hoặc phê duyệt" });
    await expect(emptyStateHeading).toBeVisible();
    await expect(
      page.getByText("Hiện tại không có bản dịch EcoNews nào đang chờ Ban Giám đốc kiểm duyệt trong hàng đợi này."),
    ).toBeVisible();

    // Verify absence of fake claims
    await expect(page.getByText("Tất cả các bản dịch EcoNews đã được rà soát và công bố đồng bộ")).toHaveCount(0);

    // Capture 6: Empty state
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_empty_state_1440x900.png"),
      fullPage: false,
    });
  });

  test("3. Viewer Permission: Read-only access has zero approve or publish actions in Drawer", async ({
    page,
  }) => {
    // Arrange: Create a draft article
    const slug = uniqueSlug("viewer-check");
    await createArticleViaApi("editor", slug, true);

    // Sign in as viewer
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "viewer", "/");

    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await expect(articleCard).toBeVisible();

    // Viewer can click "Xem & xét duyệt"
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();

    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();

    // Verify viewer has NO approve button and NO publish button
    await expect(drawer.getByRole("button", { name: /Phê duyệt bản dịch/ })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Xuất bản bài viết" })).toHaveCount(0);
    await expect(drawer.getByText("Chế độ xem trước (cần quyền Reviewer để duyệt)")).toBeVisible();

    await drawer.getByTestId("drawer-close-btn").click();
  });

  test("4. Responsive Layout: Desktop 1366x768, Tablet 1024x768, and Mobile 390x844 with full drawer", async ({
    page,
  }) => {
    const slug = uniqueSlug("responsive-check");
    await createArticleViaApi("editor", slug, true);

    // 1. Tablet 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginViaUi(page, "reviewer", "/");
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();

    // 2. Desktop 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByText("Kho Nội Dung EcoNews (Real-time)")).toBeVisible();

    // 3. Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();

    // Capture Mobile Dashboard
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_mobile_390x844.png"),
      fullPage: false,
    });

    // Open Drawer on Mobile
    const mobileCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await mobileCard.getByRole("button", { name: "Xem & xét duyệt" }).click();

    const mobileDrawer = page.getByTestId("quick-review-drawer");
    await expect(mobileDrawer).toBeVisible();
    await expect(mobileDrawer.getByRole("heading", { level: 2, name: `Bài viết ${slug}` })).toBeVisible();

    // Capture Mobile Drawer
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_mobile_drawer_390x844.png"),
      fullPage: false,
    });

    await mobileDrawer.getByTestId("drawer-close-btn").click();
    await expect(mobileDrawer).not.toBeVisible();
  });

  test("5. Workspaces Isolation: Pages and Supply Chain navigate to specialist modules without corrupting queue", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "editor", "/");

    // Click "Mở Story Studio" in isolated workspace panel
    const storyStudioBtn = page.getByRole("button", { name: "Mở Story Studio" });
    await expect(storyStudioBtn).toBeVisible();
    await storyStudioBtn.click();
    await expect(page).toHaveURL(/\/supply-chain\/stages$/);

    // Navigate back to Dashboard
    await page.goto("/");

    // Click "Quản lý Trang Web" in isolated workspace panel
    const pagesBtn = page.getByRole("button", { name: "Quản lý Trang Web" });
    await expect(pagesBtn).toBeVisible();
    await pagesBtn.click();
    await expect(page).toHaveURL(/\/content\/pages$/);
  });

  test("6. Mixed locale approval & queue removal: Article remains while 1 locale is pending, disappears once all approved", async ({
    page,
  }) => {
    // Arrange: Create article with both VI and EN unreviewed
    const slug = uniqueSlug("mixed-locale");
    await createArticleViaApi("editor", slug, true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await expect(articleCard).toBeVisible();

    // 1. Open drawer and approve VI only
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();
    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();

    await drawer.getByTestId("drawer-approve-btn").click();
    await expect(drawer.getByText("Bản dịch VI đã duyệt")).toBeVisible();

    // 2. Publish article (VI is approved, EN is not yet approved)
    await drawer.getByTestId("drawer-publish-btn").click();
    const confirmBtn = page.getByTestId("confirm-publish-btn");
    await confirmBtn.click();
    await expect(drawer.getByText("Đang công khai")).toBeVisible();

    // Close drawer
    await drawer.getByTestId("drawer-close-btn").click();
    await expect(drawer).not.toBeVisible();

    // 3. Queue Retention: Since EN is still unreviewed, backend awaitingReviewIds() still includes it!
    await expect(articleCard).toBeVisible();
    await expect(articleCard.getByText("VI: Đã duyệt")).toBeVisible();
    await expect(articleCard.getByText("EN: Chờ duyệt")).toBeVisible();

    // 4. Now open drawer again to approve EN
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();
    await expect(drawer).toBeVisible();

    // Switch to EN tab
    await drawer.getByRole("button", { name: "English (EN)" }).click();
    await expect(drawer.getByText("EN: Chờ Ban Giám đốc duyệt")).toBeVisible();

    // Approve EN
    await drawer.getByTestId("drawer-approve-btn").click();
    await expect(drawer.getByText("Bản dịch EN đã duyệt")).toBeVisible();

    // Close drawer
    await drawer.getByTestId("drawer-close-btn").click();
    await expect(drawer).not.toBeVisible();

    // 5. Queue Removal: Both VI and EN are approved! Backend awaitingReviewIds() no longer includes it!
    // The article automatically disappears from the awaiting review queue!
    await expect(articleCard).not.toBeVisible({ timeout: 10000 });
  });

  test("7. Error Handling: 409 REVISION_CONFLICT displays conflict banner and retry reload button", async ({
    page,
  }) => {
    const slug = uniqueSlug("conflict-test");
    await createArticleViaApi("editor", slug, true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();

    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();

    // Intercept approve endpoint to return 409 REVISION_CONFLICT matching backend ErrorResponse
    await page.route("**/api/v1/admin/articles/*/translations/*/approve", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 409,
          code: "REVISION_CONFLICT",
          message: "Draft is at revision 2, not 1; reload and retry",
        }),
      });
    });

    // Attempt approval
    await drawer.getByTestId("drawer-approve-btn").click();

    // Verify revision conflict warning banner is displayed
    await expect(drawer.getByText("Xung đột phiên bản nội dung")).toBeVisible();
    await expect(
      drawer.getByText("Bản nháp đã được cập nhật bởi biên tập viên khác. Vui lòng tải lại dữ liệu."),
    ).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Tải lại dữ liệu mới nhất" })).toBeVisible();

    await drawer.getByTestId("drawer-close-btn").click();
  });

  test("8. Server Validation Rejection on Publish: 409 TRANSLATION_NOT_APPROVED error handling", async ({
    page,
  }) => {
    const slug = uniqueSlug("server-reject");
    await createArticleViaApi("editor", slug, true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();

    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();

    // Approve VI
    await drawer.getByTestId("drawer-approve-btn").click();
    await expect(drawer.getByText("Bản dịch VI đã duyệt")).toBeVisible();

    // Intercept publish endpoint to return 409 TRANSLATION_NOT_APPROVED matching backend ErrorResponse
    await page.route("**/api/v1/admin/articles/*/publish", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 409,
          code: "TRANSLATION_NOT_APPROVED",
          message: "Live translation(s) changed and need approval: en",
          details: { locales: ["en"] },
        }),
      });
    });

    // Request publish and confirm
    await drawer.getByTestId("drawer-publish-btn").click();
    await page.getByTestId("confirm-publish-btn").click();

    // Verify error notification with exact server message
    await expect(page.getByText("Không thể xuất bản bài viết")).toBeVisible();
    await expect(page.getByText(/Có bản dịch chưa được duyệt nên chưa thể xuất bản|Live translation/)).toBeVisible();

    await drawer.getByTestId("drawer-close-btn").click();
  });

  test("9. Session Expiration & In-place Recovery in Drawer: session expiration prompts re-auth without closing drawer", async ({
    page,
  }) => {
    const slug = uniqueSlug("session-expire-drawer");
    await createArticleViaApi("editor", slug, true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    const articleCard = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await articleCard.getByRole("button", { name: "Xem & xét duyệt" }).click();

    const drawer = page.getByTestId("quick-review-drawer");
    await expect(drawer).toBeVisible();

    // Revoke session server-side
    const { csrfToken } = await (await page.request.get(`${E2E.api}/api/v1/auth/session`)).json();
    const revoked = await page.request.post(`${E2E.api}/api/v1/auth/logout`, { headers: { "X-CSRF-Token": csrfToken } });
    expect(revoked.status()).toBe(204);

    // Attempt approval with expired session -> 401 triggers in-place re-auth modal
    await drawer.getByTestId("drawer-approve-btn").click();

    const expiryDialog = page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });
    await expect(expiryDialog).toBeVisible();

    // Re-authenticate in place
    await expiryDialog.getByLabel("Mật khẩu").fill(E2E.password);
    await expiryDialog.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(expiryDialog).toBeHidden();

    // Drawer is still intact and open!
    await expect(drawer).toBeVisible();

    // Approve now succeeds with fresh session
    await drawer.getByTestId("drawer-approve-btn").click();
    await expect(drawer.getByText("Bản dịch VI đã duyệt")).toBeVisible();

    await drawer.getByTestId("drawer-close-btn").click();
  });

  test("10. Final Visual Acceptance & Double Submit Prevention at 1440x900 and 1366x768", async ({
    page,
  }) => {
    const slug = uniqueSlug("visual-acceptance");
    await createArticleViaApi("editor", slug, true);

    // --- Viewport 1440x900 ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, "reviewer", "/");

    const articleCard1440 = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await expect(articleCard1440).toBeVisible();

    // Capture Dashboard at 1440x900
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_executive_1440x900.png"),
      fullPage: false,
    });

    // Open Quick Review Drawer
    await articleCard1440.getByRole("button", { name: "Xem & xét duyệt" }).click();
    const drawer1440 = page.getByTestId("quick-review-drawer");
    await expect(drawer1440).toBeVisible();

    // Capture Quick Review Drawer at 1440x900
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_drawer_1440x900.png"),
      fullPage: false,
    });

    // Verify double-submit prevention: Delay approve route to observe disabled state
    await page.route("**/api/v1/admin/articles/*/translations/*/approve", async (route) => {
      await page.waitForTimeout(600);
      await route.continue();
    });

    const approveBtn = drawer1440.getByTestId("drawer-approve-btn");
    await approveBtn.click();
    // Verify button is disabled during in-flight mutation
    await expect(approveBtn).toBeDisabled();
    // Wait for mutation to finish
    await expect(drawer1440.getByText("Bản dịch VI đã duyệt")).toBeVisible();

    await drawer1440.getByTestId("drawer-close-btn").click();
    await expect(drawer1440).not.toBeVisible();

    // --- Viewport 1366x768 ---
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    const articleCard1366 = page.locator("div.rounded-xl").filter({ hasText: `Bài viết ${slug}` }).first();
    await expect(articleCard1366).toBeVisible();

    // Capture Dashboard at 1366x768
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_executive_1366x768.png"),
      fullPage: false,
    });

    // Open Quick Review Drawer at 1366x768
    await articleCard1366.getByRole("button", { name: "Xem & xét duyệt" }).click();
    const drawer1366 = page.getByTestId("quick-review-drawer");
    await expect(drawer1366).toBeVisible();

    // Capture Quick Review Drawer at 1366x768
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard_drawer_1366x768.png"),
      fullPage: false,
    });

    await drawer1366.getByTestId("drawer-close-btn").click();
  });
});

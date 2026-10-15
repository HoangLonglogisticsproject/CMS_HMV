import { test, expect } from "@playwright/test";
import { loginViaUi } from "./helpers";

test.describe("Supply Chain Stages Content Studio", () => {
  test("renders outline timeline, edits narrative, preserves locale, and opens preview modal", async ({
    page,
  }) => {
    // 1. Login as editor and navigate to Supply Chain Stages
    await loginViaUi(page, "editor", "/supply-chain/stages");
    await expect(page).toHaveURL(/\/supply-chain\/stages$/);

    // 2. Verify Page Header & Breadcrumb
    await expect(page.getByRole("heading", { name: "Hành trình chuỗi cung ứng" })).toBeVisible();
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByText("Chuỗi cung ứng")).toBeVisible();
    await expect(breadcrumb.getByText("Hành trình")).toBeVisible();

    // 3. Verify Stage Navigator Outline
    const navigator = page.getByRole("navigation", { name: "Danh sách các công đoạn" });
    await expect(navigator).toBeVisible();
    await expect(navigator.getByText("Vùng Nguyên Liệu Bản Địa (Origin)")).toBeVisible();
    await expect(navigator.getByText("Thu Gom & Sơ Chế Nguyên Liệu (Raw Materials)")).toBeVisible();
    await expect(navigator.getByText("Chế Biến & Đóng Gói Tiêu Chuẩn (Processing)")).toBeVisible();

    // 4. Verify Content Studio Main Editor is populated with Stage #1
    const titleInput = page.locator("#stage-title-input");
    await expect(titleInput).toHaveValue("1. Vùng Nguyên Liệu Bản Địa (Origin)");

    // 5. Test dirty state detection and saving
    const subtitleInput = page.locator("#stage-subtitle-input");
    const originalSubtitle = await subtitleInput.inputValue();
    await subtitleInput.fill(`${originalSubtitle} — Đã cập nhật kiểm định 2026`);

    // Verify unsaved changes badge appears
    await expect(page.getByText("Có thay đổi chưa lưu")).toBeVisible();

    // 6. Test save action
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp công đoạn thành công!")).toBeVisible();

    // Verify dirty state cleared
    await expect(page.getByText("Đã đồng bộ")).toBeVisible();

    // 7. Test CMS Preview Modal
    await page.getByRole("button", { name: "Xem trước" }).first().click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByText("CMS Preview")).toBeVisible();
    await expect(previewDialog.getByText("HMV trực tiếp thực hiện")).toBeVisible();
    await expect(previewDialog.getByText("Kiểm soát thổ nhưỡng & nhật ký canh tác chuẩn VietGAP")).toBeVisible();

    // Close preview
    await previewDialog.getByRole("button", { name: "Đóng xem trước" }).click();
    await expect(previewDialog).toBeHidden();
  });
});

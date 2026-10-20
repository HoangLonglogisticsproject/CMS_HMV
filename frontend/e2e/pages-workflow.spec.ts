import { expect, test, type Page } from "@playwright/test";
import { aboutContent } from "../../backend/test/fixtures";
import { apiAs, loginViaUi, logoutViaUi, publicApi, toast } from "./helpers";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const workflow = (page: Page, locale: string) => page.getByTestId(`page-workflow-${locale}`);

test("About page: edit → submit → request changes → fix → approve → publish VI; EN stays private", async ({ page }) => {
  const pub = await publicApi();
  // Arrange a complete draft (rev 1) through the API; everything after happens in the UI.
  const editorApi = await apiAs("editor");
  const current = await editorApi.get("/api/v1/admin/pages/about");
  await editorApi.patch("/api/v1/admin/pages/about/draft", {
    expectedRevision: current.revision,
    translations: [
      { locale: "vi", content: aboutContent("E2E VI") },
      { locale: "en", content: aboutContent("E2E EN") },
    ],
  });
  const base = current.revision + 1;
  await editorApi.dispose();

  // --- Editor: list → editor, edit VI, save, submit ---
  await loginViaUi(page, "editor", "/content/pages");
  await expect(page.getByRole("heading", { name: "Trang website & Landing Pages" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "about" })).toContainText("E2E VI About");
  await button(page, "Biên tập").click();
  await expect(page).toHaveURL(/\/content\/pages\/about$/);
  await expect(button(page, "Duyệt VI")).toHaveCount(0); // editors cannot review
  await expect(button(page, "Xuất bản VI")).toHaveCount(0);

  await page.getByLabel("Tiêu đề trang").fill("E2E Về HMV");
  await expect(page.getByText("Chưa lưu thay đổi")).toBeVisible();
  await expect(button(page, "Gửi duyệt VI")).toBeDisabled(); // save first
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, `Đã lưu bản nháp (bản #${base + 1})`)).toBeVisible();
  await button(page, "Gửi duyệt VI").click();
  await expect(toast(page, "Đã gửi duyệt bản VI")).toBeVisible();
  await expect(workflow(page, "vi")).toContainText("Chờ duyệt");
  await expect(workflow(page, "en")).toContainText("Bản nháp");

  // --- Reviewer: request changes ---
  await logoutViaUi(page);
  await loginViaUi(page, "reviewer", "/content/pages/about");
  await expect(page.getByLabel("Tiêu đề trang")).toBeDisabled(); // reviewers do not write drafts
  await button(page, "Yêu cầu sửa VI").click();
  await page.getByLabel("Cần chỉnh sửa gì?").fill("Rút gọn đoạn giới thiệu");
  await button(page, "Gửi yêu cầu VI").click();
  await expect(toast(page, "Đã yêu cầu chỉnh sửa bản VI")).toBeVisible();
  await expect(workflow(page, "vi")).toContainText("Cần chỉnh sửa");
  await expect(workflow(page, "vi")).toContainText("Rút gọn đoạn giới thiệu");

  // --- Editor: fix and resubmit ---
  await logoutViaUi(page);
  await loginViaUi(page, "editor", "/content/pages/about");
  await expect(workflow(page, "vi")).toContainText("Rút gọn đoạn giới thiệu");
  await page.getByLabel("Đoạn giới thiệu").first().fill("Đoạn giới thiệu ngắn");
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, `Đã lưu bản nháp (bản #${base + 2})`)).toBeVisible();
  await button(page, "Gửi duyệt VI").click();
  await expect(workflow(page, "vi")).toContainText("Chờ duyệt");

  // --- Reviewer: approve and publish VI ---
  await logoutViaUi(page);
  await loginViaUi(page, "reviewer", "/content/pages/about");
  await button(page, "Duyệt VI").click();
  await expect(toast(page, "Đã duyệt bản VI")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await button(page, "Xuất bản VI").click();
  await expect(toast(page, "Đã xuất bản bản VI")).toBeVisible();
  await expect(workflow(page, "vi")).toContainText("Đang công khai");
  await expect(page.getByTestId("page-history")).toContainText(`#${base + 2}`);

  // --- Public API: VI serves the approved edit, EN was never published ---
  const vi = await pub.get("/api/v1/public/pages/about?locale=vi");
  expect(vi.status()).toBe(200);
  expect(await vi.json()).toMatchObject({ title: "E2E Về HMV", content: { hero: { lead: "Đoạn giới thiệu ngắn" } } });
  expect((await pub.get("/api/v1/public/pages/about?locale=en")).status()).toBe(404);
  await pub.dispose();
});

test("viewers can read pages but not edit or act on them", async ({ page }) => {
  await loginViaUi(page, "viewer", "/content/pages/about");
  await expect(page.getByTestId("page-workflow")).toBeVisible();
  await expect(button(page, "Lưu Bản Nháp")).toBeDisabled();
  for (const name of ["Gửi duyệt VI", "Duyệt VI", "Yêu cầu sửa VI", "Xuất bản VI"]) await expect(button(page, name)).toHaveCount(0);
});

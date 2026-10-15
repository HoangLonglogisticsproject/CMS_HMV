import { expect, test } from "@playwright/test";
import { apiAs, createArticleViaApi, loginViaApi, toast, uniqueSlug } from "./helpers";

const TITLE = "Nhập tiêu đề bài viết phân tích...";
const EXCERPT = "Tóm tắt 2-3 câu trọng tâm của bài viết để kích thích người đọc...";

test("409 conflict: the second editor keeps their edits and can apply them on top of the latest revision", async ({ browser }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("conflict"), false);
  const a = await browser.newPage();
  const b = await (await browser.newContext()).newPage();
  await loginViaApi(a, "editor");
  await loginViaApi(b, "editor2");
  await a.goto(`/content/articles/${article.id}`);
  await b.goto(`/content/articles/${article.id}`);
  await expect(a.getByPlaceholder(TITLE)).not.toHaveValue("");
  await expect(b.getByPlaceholder(TITLE)).not.toHaveValue("");

  await a.getByPlaceholder(TITLE).fill("Tiêu đề do biên tập viên A sửa");
  await a.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  await expect(toast(a, "Đã lưu bản nháp (bản #2)")).toBeVisible();

  await b.getByPlaceholder(EXCERPT).fill("Tóm tắt do biên tập viên B viết");
  await b.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  const dialog = b.getByTestId("revision-conflict");
  await expect(dialog).toBeVisible();
  await expect(b.getByPlaceholder(EXCERPT)).toHaveValue("Tóm tắt do biên tập viên B viết"); // nothing lost

  await dialog.getByRole("button", { name: "Áp dụng thay đổi của tôi" }).click();
  await expect(toast(b, "Đã lưu bản nháp (bản #3)")).toBeVisible();
  // Merged: A's title survives, B's excerpt applied.
  await expect(b.getByPlaceholder(TITLE)).toHaveValue("Tiêu đề do biên tập viên A sửa");
  await expect(b.getByPlaceholder(EXCERPT)).toHaveValue("Tóm tắt do biên tập viên B viết");

  const api = await apiAs("editor");
  const detail = await api.get(`/api/v1/admin/articles/${article.id}`);
  expect(detail.revision).toBe(3);
  expect(detail.translations[0]).toMatchObject({ title: "Tiêu đề do biên tập viên A sửa", excerpt: "Tóm tắt do biên tập viên B viết" });

  // Second conflict, resolved by discarding B's change.
  await a.reload();
  await a.getByPlaceholder(EXCERPT).fill("A ghi đè tóm tắt");
  await a.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  await expect(toast(a, "Đã lưu bản nháp (bản #4)")).toBeVisible();
  await b.getByPlaceholder(TITLE).fill("B đổi tiêu đề nhưng sẽ bỏ");
  await b.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  await dialog.getByRole("button", { name: "Tải bản mới nhất" }).click();
  await expect(b.getByPlaceholder(TITLE)).toHaveValue("Tiêu đề do biên tập viên A sửa");
  await expect(b.getByPlaceholder(EXCERPT)).toHaveValue("A ghi đè tóm tắt");
  expect((await api.get(`/api/v1/admin/articles/${article.id}`)).revision).toBe(4);
  await api.dispose();
});

test("validation: client rules mirror the API, server errors land on the right field", async ({ page }) => {
  const taken = uniqueSlug("da-dung");
  await createArticleViaApi("editor", taken, false);
  const article = await createArticleViaApi("editor", uniqueSlug("validation"), false);
  await loginViaApi(page, "editor");
  await page.goto(`/content/articles/${article.id}`);
  const slug = page.getByPlaceholder("slug-bai-viet");

  // Client-side: same slug rule as the backend, no request sent.
  await slug.fill("Chuỗi Cung Ứng");
  await page.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  await expect(toast(page, "Vui lòng kiểm tra lại thông tin bài viết")).toBeVisible();
  await expect(page.getByText(/Slug chỉ gồm chữ thường không dấu/).first()).toBeVisible();

  // Server-side: slug owned by another article → 409 SLUG_TAKEN mapped to the slug field.
  await slug.fill(`${taken}-vi`);
  await page.getByRole("button", { name: "Lưu Bản Nháp" }).click();
  await expect(toast(page, "Không thể lưu bài viết")).toBeVisible();
  await expect(page.getByText("Slug đã được bài viết khác sử dụng")).toBeVisible();

  // Unsafe link rejected in the editor before it reaches the API.
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+A");
  page.once("dialog", (d) => void d.accept("javascript:alert(1)"));
  await page.getByTitle("Chèn liên kết").click();
  await expect(toast(page, "Liên kết không hợp lệ")).toBeVisible();
});

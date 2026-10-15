import { expect, test, type Page } from "@playwright/test";
import { apiAs, createArticleViaApi, loginViaApi, makePng, toast, uniqueSlug } from "./helpers";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("media library: upload through the backend, edit per-locale alt text, reject non-images", async ({ page }) => {
  const title = `Kho lạnh E2E ${Date.now().toString(36)}`;
  await loginViaApi(page, "editor");
  await page.goto("/content/media");

  await button(page, "Tải Lên Ảnh").click();
  await page.getByPlaceholder("Ví dụ: Cánh đồng cà phê thu hoạch...").fill(title);
  await page.locator("#media-upload-file").setInputFiles({ name: "kho-lanh.png", mimeType: "image/png", buffer: makePng(40, 30) });
  await button(page, "Tải Lên").click();
  await expect(toast(page, "Đã tải ảnh lên thư viện media")).toBeVisible();

  const detail = page.getByTestId("media-detail");
  await expect(detail.getByRole("heading", { name: title })).toBeVisible();
  await expect(detail.getByText("Kích thước: 40×30")).toBeVisible();
  await detail.getByLabel("Alt (VI)").fill("Kho lạnh bảo quản nông sản");
  await detail.getByLabel("Alt (EN)").fill("Cold storage for produce");
  await detail.getByRole("button", { name: "Lưu Alt Text" }).click();
  await expect(toast(page, "Đã lưu alt text mặc định")).toBeVisible();

  // Persisted in PostgreSQL: visible again after a full reload.
  await page.reload();
  await page.getByText(title).first().click();
  await expect(detail.getByLabel("Alt (VI)")).toHaveValue("Kho lạnh bảo quản nông sản");
  await expect(detail.getByLabel("Alt (EN)")).toHaveValue("Cold storage for produce");
  await expect(detail.getByText("Chưa được bài viết nào sử dụng")).toBeVisible();

  // The client-declared type is ignored: a text file named .png is refused by the server.
  await button(page, "Tải Lên Ảnh").click();
  await page.locator("#media-upload-file").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await button(page, "Tải Lên").click();
  await expect(toast(page, "Tải ảnh lên thất bại")).toContainText("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.");
});

test("article editor: cover + inline image use mediaId, survive reload, and are tracked as usages", async ({ page }) => {
  const api = await apiAs("editor");
  // Upload through the API so the asset exists; selection happens in the UI.
  const title = `Container lạnh ${Date.now().toString(36)}`;
  const upload = await api.ctx.post("/api/v1/admin/media", {
    headers: { "X-CSRF-Token": (await (await api.ctx.get("/api/v1/auth/session")).json()).csrfToken },
    multipart: { file: { name: "container.png", mimeType: "image/png", buffer: makePng(64, 48) }, title },
  });
  expect(upload.status()).toBe(201);
  const asset = await upload.json();

  const article = await createArticleViaApi("editor", uniqueSlug("anh"), false);
  await loginViaApi(page, "editor");
  await page.goto(`/content/articles/${article.id}`);
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Đoạn văn trước ảnh.");

  // Inline image via the media picker.
  await page.getByTitle("Chèn ảnh từ thư viện Media Asset").click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Tìm theo tên file, chủ đề hoặc chú thích...").fill(title);
  await picker.getByText(title).first().click();
  await picker.getByPlaceholder("Mô tả ảnh tiếng Việt cho SEO...").fill("Container lạnh tại cảng");
  await button(page, "Chọn Ảnh Này").click();
  await expect(editor.locator(`img[data-media-id="${asset.id}"]`)).toBeVisible();

  // Upload failure inside the picker does not touch the editor content.
  await button(page, "Chọn Từ Thư Viện Media").click();
  await button(page, "Tải Lên Ảnh").click();
  await page.locator("#picker-upload-file").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("nope") });
  await button(page, "Tải Lên").click();
  await expect(toast(page, "Tải ảnh lên thất bại")).toBeVisible();
  await button(page, "Thư Viện Ảnh").click();
  // Cover image from the same picker.
  await picker.getByPlaceholder("Tìm theo tên file, chủ đề hoặc chú thích...").fill(title);
  await picker.getByText(title).first().click();
  await picker.getByPlaceholder("Mô tả ảnh tiếng Việt cho SEO...").fill("Ảnh bìa container lạnh");
  await button(page, "Chọn Ảnh Này").click();
  await expect(editor).toContainText("Đoạn văn trước ảnh.");

  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();

  // Reload: the stored document has only mediaId; the API resolves src again.
  await page.reload();
  const img = page.locator(`.ProseMirror img[data-media-id="${asset.id}"]`);
  await expect(img).toHaveAttribute("src", asset.url);
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(64);
  await expect(page.getByAltText("Ảnh bìa container lạnh")).toBeVisible();

  const detail = await api.get(`/api/v1/admin/articles/${article.id}`);
  expect(detail.coverMedia.id).toBe(asset.id);
  const vi = detail.translations[0];
  expect(vi.coverImageAlt).toBe("Ảnh bìa container lạnh");
  const imageNode = vi.content.content.find((n: { type: string }) => n.type === "image");
  expect(imageNode.attrs).toMatchObject({ mediaId: asset.id, alt: "Container lạnh tại cảng", src: asset.url });

  const usages = await api.get(`/api/v1/admin/media/${asset.id}/usages`);
  expect(usages).toMatchObject({ inUse: true, usages: [{ entityId: article.id, contexts: ["DRAFT"] }] });
  await api.dispose();
});

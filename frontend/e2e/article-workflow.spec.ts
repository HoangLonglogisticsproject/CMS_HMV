import { expect, test, type Page } from "@playwright/test";
import { apiAs, loginViaUi, logoutViaUi, publicApi, toast } from "./helpers";

const VI = {
  title: "Chuỗi cung ứng cà phê Robusta Tây Nguyên",
  excerpt: "Phân tích vùng nguyên liệu và tiêu chuẩn xuất khẩu.",
  body: "Cà phê Robusta Đắk Lắk được thu hoạch và sơ chế theo tiêu chuẩn xuất khẩu.",
};
const EN = {
  title: "Central Highlands Robusta coffee supply chain",
  excerpt: "Sourcing regions and export standards.",
  body: "Dak Lak Robusta is harvested and processed to export standards.",
};

const editor = (page: Page) => page.locator(".ProseMirror");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function fillLocale(page: Page, locale: "vi" | "en", data: typeof VI, slug: string) {
  await button(page, locale === "vi" ? "Tiếng Việt (VI)" : "English (EN)").click();
  await page.getByPlaceholder(locale === "vi" ? "Nhập tiêu đề bài viết phân tích..." : "Enter English article title...").fill(data.title);
  await page
    .getByPlaceholder(locale === "vi" ? "Tóm tắt 2-3 câu trọng tâm của bài viết để kích thích người đọc..." : "Brief 2-3 sentence article summary...")
    .fill(data.excerpt);
  await page.getByPlaceholder("slug-bai-viet").fill(slug);
  await editor(page).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(data.body);
}

test("EcoNews: create → edit VI/EN → save → reload → approve → publish → public API", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const slugVi = `ca-phe-robusta-${suffix}`;
  const slugEn = `robusta-coffee-${suffix}`;
  const pub = await publicApi();

  // --- Editor: create and write both locales ---
  await loginViaUi(page, "editor");
  await button(page, "Tạo Bài Viết Mới").click();
  await expect(page).toHaveURL(/\/content\/articles\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(toast(page, "Đã tạo bản nháp bài viết mới!")).toBeVisible();

  await fillLocale(page, "vi", VI, slugVi);
  await fillLocale(page, "en", EN, slugEn);
  await expect(page.getByText("Chưa lưu thay đổi")).toBeVisible();
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  await expect(page.getByText("Đã lưu vào hệ thống")).toBeVisible();

  // Editors cannot approve or publish.
  await expect(page.getByRole("button", { name: /^Duyệt (VI|EN)$/ })).toHaveCount(0);
  await expect(button(page, "Xuất bản")).toHaveCount(0);

  // --- Refresh: everything comes back from PostgreSQL, locales independent ---
  await page.reload();
  await expect(page.getByPlaceholder("Nhập tiêu đề bài viết phân tích...")).toHaveValue(VI.title);
  await expect(editor(page)).toContainText(VI.body);
  await button(page, "English (EN)").click();
  await expect(page.getByPlaceholder("Enter English article title...")).toHaveValue(EN.title);
  await expect(editor(page)).toContainText(EN.body);
  await expect(page.getByPlaceholder("slug-bai-viet")).toHaveValue(slugEn);

  const api = await apiAs("reviewer");
  const saved = await api.get(`/api/v1/admin/articles/${id}`);
  expect(saved).toMatchObject({ revision: 2, status: "DRAFT" });
  const tr = (d: { translations: Record<string, unknown>[] }, l: string) => d.translations.find((t) => t.locale === l)!;
  expect(tr(saved, "vi")).toMatchObject({ title: VI.title, slug: slugVi, excerpt: VI.excerpt, reviewStatus: "UNREVIEWED" });
  expect(tr(saved, "en")).toMatchObject({ title: EN.title, slug: slugEn, excerpt: EN.excerpt });
  expect(tr(saved, "vi").contentHash).not.toBe(tr(saved, "en").contentHash);
  expect((await pub.get(`/api/v1/public/articles/${slugVi}?locale=vi`)).status()).toBe(404); // drafts are never public

  // --- Reviewer: review (server preview), approve VI, publish ---
  await logoutViaUi(page);
  await loginViaUi(page, "reviewer");
  await page.getByPlaceholder("Tìm theo tiêu đề bài viết, tác giả hoặc đường dẫn slug...").fill(suffix);
  const row = page.getByRole("row").filter({ hasText: VI.title });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Xem" }).click();
  const preview = page.getByRole("dialog");
  await expect(preview.getByRole("heading", { name: VI.title })).toBeVisible();
  await expect(preview.getByText(VI.body)).toBeVisible();
  await preview.getByRole("button", { name: "Đóng Xem Trước" }).click();

  await row.getByRole("button", { name: "Biên Tập" }).click();
  await expect(page).toHaveURL(new RegExp(`/content/articles/${id}$`));
  await expect(button(page, "Lưu Bản Nháp")).toBeDisabled(); // reviewers do not write drafts
  await button(page, "Duyệt VI").click();
  await expect(toast(page, "Đã duyệt bản VI")).toBeVisible();
  await expect(page.getByTestId("workflow-vi").getByText("Đã duyệt")).toBeVisible();
  await expect(page.getByTestId("workflow-en").getByText("Chưa duyệt")).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await button(page, "Xuất bản").click();
  await expect(toast(page, "Đã xuất bản bài viết")).toBeVisible();
  await expect(page.getByTestId("article-workflow").getByText("Đã xuất bản")).toBeVisible();

  // --- Public API: only the approved locale is served ---
  const live = await pub.get(`/api/v1/public/articles/${slugVi}?locale=vi`);
  expect(live.status()).toBe(200);
  expect(await live.json()).toMatchObject({ title: VI.title, excerpt: VI.excerpt, locale: "vi" });
  expect((await pub.get(`/api/v1/public/articles/${slugEn}?locale=en`)).status()).toBe(404);

  await button(page, "Duyệt EN").click();
  await expect(toast(page, "Đã duyệt bản EN")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await button(page, "Xuất bản").click();
  await expect(page.getByTestId("workflow-en").getByText("Đang công khai")).toBeVisible();
  const liveEn = await (await pub.get(`/api/v1/public/articles/${slugEn}?locale=en`)).json();
  expect(liveEn).toMatchObject({ title: EN.title, alternates: [{ locale: "vi", slug: slugVi }] });

  // --- A later draft save does not touch the published revision ---
  await logoutViaUi(page);
  await loginViaUi(page, "editor", `/content/articles/${id}`);
  await page.getByPlaceholder("Nhập tiêu đề bài viết phân tích...").fill(`${VI.title} (cập nhật)`);
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #3)")).toBeVisible();
  await expect(page.getByTestId("workflow-vi").getByText("Công khai (bản cũ)")).toBeVisible();
  expect(await (await pub.get(`/api/v1/public/articles/${slugVi}?locale=vi`)).json()).toMatchObject({ title: VI.title });

  // List view reflects server state and invalidated caches.
  await page.goto("/content/articles");
  const listed = page.getByRole("row").filter({ hasText: `${VI.title} (cập nhật)` });
  await expect(listed.getByText("Đã xuất bản")).toBeVisible();
  await expect(listed.getByText("Có bản nháp mới")).toBeVisible();
  await api.dispose();
  await pub.dispose();
});

test("archive hides the article from the public API until restored", async ({ page }) => {
  const api = await apiAs("editor");
  const slug = `luu-tru-${Date.now().toString(36)}`;
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung" }] }] };
  const created = await api.post("/api/v1/admin/articles", {
    categoryCode: "COLD_CHAIN_INTEL",
    translations: [{ locale: "vi", title: "Bài viết lưu trữ", slug, content: doc }],
  }, 201);
  const reviewer = await apiAs("reviewer");
  await reviewer.post(`/api/v1/admin/articles/${created.id}/translations/vi/approve`, { expectedRevision: 1 });
  await reviewer.post(`/api/v1/admin/articles/${created.id}/publish`, { expectedRevision: 1 });
  const pub = await publicApi();
  expect((await pub.get(`/api/v1/public/articles/${slug}?locale=vi`)).status()).toBe(200);

  await loginViaUi(page, "reviewer", `/content/articles/${created.id}`);
  page.once("dialog", (d) => void d.accept());
  await button(page, "Lưu trữ").click();
  await expect(page.getByTestId("article-workflow").getByText("Lưu trữ", { exact: true })).toBeVisible();
  expect((await pub.get(`/api/v1/public/articles/${slug}?locale=vi`)).status()).toBe(404);
  await button(page, "Bỏ lưu trữ").click();
  await expect(toast(page, "Đã bỏ lưu trữ bài viết")).toBeVisible();
  expect((await pub.get(`/api/v1/public/articles/${slug}?locale=vi`)).status()).toBe(200);
  await Promise.all([api.dispose(), reviewer.dispose(), pub.dispose()]);
});

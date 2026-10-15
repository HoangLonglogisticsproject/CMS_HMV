import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, createArticleViaApi, loginViaApi, toast, uniqueSlug } from "./helpers";

/**
 * Unsaved work must survive a failed refetch of the article. The detail query refetches in the background when the
 * network reconnects and the data is stale (30 s); if that refetch fails, the editor must stay on screen with every
 * unsaved field, and the draft must still save once the API answers again.
 */

const VI_TITLE = "Nhập tiêu đề bài viết phân tích...";
const EN_TITLE = "Enter English article title...";
const VI_EXCERPT = "Tóm tắt 2-3 câu trọng tâm của bài viết để kích thích người đọc...";
const FATAL = "Không mở được bài viết"; // full-page error: only acceptable when nothing was ever loaded
const SERVER_ERROR = "Máy chủ gặp lỗi. Vui lòng thử lại sau.";
const NETWORK_ERROR = "Không kết nối được tới máy chủ API. Kiểm tra backend đang chạy.";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const editor = (page: Page) => page.locator(".ProseMirror");

/** Fails every GET of this article's detail (not /draft or /preview) until `restore()`. */
async function breakDetail(page: Page, id: string, mode: "500" | "network") {
  const url = `${E2E.api}/api/v1/admin/articles/${id}`;
  let hits = 0;
  const handler = (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    hits++;
    if (mode === "network") return route.abort("failed");
    return route.fulfill({
      status: 500,
      headers: { "access-control-allow-origin": E2E.web, "access-control-allow-credentials": "true" },
      json: { statusCode: 500, code: "INTERNAL_ERROR", message: "Injected failure" },
    });
  };
  await page.route(url, handler);
  return { hits: () => hits, restore: () => page.unroute(url, handler) };
}

/** Makes the detail query stale and fires the reconnect refetch TanStack Query performs after a network drop. */
async function backgroundRefetch(page: Page, context: BrowserContext) {
  await page.clock.fastForward("00:45");
  await context.setOffline(true);
  await context.setOffline(false);
}

async function openEditor(page: Page, id: string) {
  await page.clock.install();
  await loginViaApi(page, "editor");
  await page.goto(`/content/articles/${id}`);
  await expect(page.getByPlaceholder(VI_TITLE)).toBeVisible();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

async function relogin(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Mật khẩu").fill(E2E.password);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(dialog).toBeHidden();
}

async function revokeSession(page: Page) {
  const { csrfToken } = await (await page.request.get(`${E2E.api}/api/v1/auth/session`)).json();
  const res = await page.request.post(`${E2E.api}/api/v1/auth/logout`, { headers: { "X-CSRF-Token": csrfToken } });
  expect(res.status()).toBe(204);
}

async function savedDetail(id: string) {
  const api = await apiAs("editor");
  const detail = await api.get(`/api/v1/admin/articles/${id}`);
  await api.dispose();
  return detail;
}

test("title and excerpt survive a background refetch that answers 500, then save on the loaded revision", async ({ page, context }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("refetch-500"), false);
  await openEditor(page, article.id);
  await page.getByPlaceholder(VI_TITLE).fill("Tiêu đề chưa lưu khi máy chủ lỗi");
  await page.getByPlaceholder(VI_EXCERPT).fill("Tóm tắt chưa lưu khi máy chủ lỗi");

  const broken = await breakDetail(page, article.id, "500");
  await backgroundRefetch(page, context);
  await expect.poll(broken.hits).toBeGreaterThan(0);
  await expect(page.getByText(SERVER_ERROR).first()).toBeVisible(); // the failure is reported, not hidden

  await expect(page.getByText(FATAL)).toHaveCount(0);
  await expect(page.getByTestId("article-refetch-error")).toBeVisible(); // reported in a non-blocking banner
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề chưa lưu khi máy chủ lỗi");
  await expect(page.getByPlaceholder(VI_EXCERPT)).toHaveValue("Tóm tắt chưa lưu khi máy chủ lỗi");
  await expect(page.getByText("Chưa lưu thay đổi")).toBeVisible();

  // API recovers: the draft saves on the revision it was loaded from.
  await broken.restore();
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  await expect(page.getByTestId("article-refetch-error")).toHaveCount(0);
  const saved = await savedDetail(article.id);
  expect(saved.translations[0]).toMatchObject({ title: "Tiêu đề chưa lưu khi máy chủ lỗi", excerpt: "Tóm tắt chưa lưu khi máy chủ lỗi" });
});

test("rich text typed in Tiptap survives a background refetch that fails with a network error", async ({ page, context }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("refetch-net"), false);
  await openEditor(page, article.id);
  await typeAtEnd(page, " Đoạn văn chưa lưu.");

  const broken = await breakDetail(page, article.id, "network");
  await backgroundRefetch(page, context);
  await expect.poll(broken.hits).toBeGreaterThan(0);
  await expect(page.getByText(NETWORK_ERROR).first()).toBeVisible();

  await expect(page.getByText(FATAL)).toHaveCount(0);
  await expect(page.getByTestId("article-refetch-error")).toBeVisible();
  await expect(editor(page)).toContainText("Nội dung tiếng Việt Đoạn văn chưa lưu.");

  // Retrying once the API is back clears the error but never overwrites the unsaved text with server data.
  await broken.restore();
  await page.getByTestId("article-refetch-error").getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByTestId("article-refetch-error")).toHaveCount(0);
  await expect(editor(page)).toContainText("Nội dung tiếng Việt Đoạn văn chưa lưu.");
  await expect(page.getByText("Chưa lưu thay đổi")).toBeVisible();

  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  expect(JSON.stringify((await savedDetail(article.id)).translations[0].content)).toContain("Đoạn văn chưa lưu.");
});

test("VI and EN edits both survive locale switches around a failed refetch", async ({ page, context }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("refetch-locales"), true);
  await openEditor(page, article.id);
  await page.getByPlaceholder(VI_TITLE).fill("Tiêu đề VI chưa lưu");
  await typeAtEnd(page, " Thêm VI.");
  await button(page, "English (EN)").click();
  await page.getByPlaceholder(EN_TITLE).fill("Unsaved EN title");
  await typeAtEnd(page, " More EN.");

  const broken = await breakDetail(page, article.id, "500");
  await backgroundRefetch(page, context);
  await expect.poll(broken.hits).toBeGreaterThan(0);
  await expect(page.getByText(SERVER_ERROR).first()).toBeVisible();
  await expect(page.getByText(FATAL)).toHaveCount(0);
  await expect(page.getByTestId("article-refetch-error")).toBeVisible();

  await expect(page.getByPlaceholder(EN_TITLE)).toHaveValue("Unsaved EN title");
  await expect(editor(page)).toContainText("English content More EN.");
  await button(page, "Tiếng Việt (VI)").click();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề VI chưa lưu");
  await expect(editor(page)).toContainText("Nội dung tiếng Việt Thêm VI.");
  await button(page, "English (EN)").click();
  await expect(page.getByPlaceholder(EN_TITLE)).toHaveValue("Unsaved EN title");

  await broken.restore();
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  const saved = await savedDetail(article.id);
  const tr = (l: string) => saved.translations.find((t: { locale: string }) => t.locale === l);
  expect(tr("vi").title).toBe("Tiêu đề VI chưa lưu");
  expect(tr("en").title).toBe("Unsaved EN title");
  expect(JSON.stringify(tr("vi").content)).toContain("Thêm VI.");
  expect(JSON.stringify(tr("en").content)).toContain("More EN.");
});

test("switching VI → EN → VI shows each locale's own unsaved fields (no refetch involved)", async ({ page }) => {
  const s = uniqueSlug("locale-switch");
  const [viSlug, enSlug] = [`${s}-moi-vi`, `${s}-new-en`];
  const article = await createArticleViaApi("editor", s, true);
  await openEditor(page, article.id);
  const EN_EXCERPT = "Brief 2-3 sentence article summary...";
  const tab = (name: "Cài Đặt" | "SEO") => page.getByRole("tab", { name }).click();
  const fill = async (title: string, titlePlaceholder: string, excerpt: string, excerptPlaceholder: string, slug: string, meta: string) => {
    await page.getByPlaceholder(titlePlaceholder).fill(title);
    await page.getByPlaceholder(excerptPlaceholder).fill(excerpt);
    await tab("SEO");
    await page.getByPlaceholder("Tiêu đề hiển thị trên Google...").fill(`${meta} title`);
    await page.getByPlaceholder("Mô tả tóm tắt cho Google SERP...").fill(`${meta} description`);
    await tab("Cài Đặt");
    await page.getByPlaceholder("slug-bai-viet").fill(slug);
  };
  // Inactive tab panels unmount (Radix), which would hide the bug: each check runs right after a locale switch with
  // its tab still open, so the same DOM inputs are re-used across locales.
  const visibleFields = async (locale: "vi" | "en", title: string, excerpt: string, slug: string) => {
    await expect(page.getByPlaceholder(locale === "vi" ? VI_TITLE : EN_TITLE)).toHaveValue(title);
    await expect(page.getByPlaceholder(locale === "vi" ? VI_EXCERPT : EN_EXCERPT)).toHaveValue(excerpt);
    await expect(page.getByPlaceholder("slug-bai-viet")).toHaveValue(slug);
  };
  const seoFields = async (metaTitle: string, metaDescription: string) => {
    await expect(page.getByPlaceholder("Tiêu đề hiển thị trên Google...")).toHaveValue(metaTitle);
    await expect(page.getByPlaceholder("Mô tả tóm tắt cho Google SERP...")).toHaveValue(metaDescription);
  };

  await fill("VI title", VI_TITLE, "VI excerpt", VI_EXCERPT, viSlug, "VI meta");
  await button(page, "English (EN)").click();
  await fill("EN title", EN_TITLE, "EN excerpt", EN_EXCERPT, enSlug, "EN meta");
  // Settings tab open: title, excerpt and slug across both switches.
  await button(page, "Tiếng Việt (VI)").click();
  await visibleFields("vi", "VI title", "VI excerpt", viSlug);
  await button(page, "English (EN)").click();
  await visibleFields("en", "EN title", "EN excerpt", enSlug);
  // SEO tab open: meta fields across both switches.
  await tab("SEO");
  await seoFields("EN meta title", "EN meta description");
  await button(page, "Tiếng Việt (VI)").click();
  await seoFields("VI meta title", "VI meta description");
  await button(page, "English (EN)").click();
  await seoFields("EN meta title", "EN meta description");

  // Editing a field after switching back writes to that locale only.
  await button(page, "Tiếng Việt (VI)").click();
  await page.getByPlaceholder(VI_TITLE).fill("VI title sửa lại");
  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  const saved = await savedDetail(article.id);
  const tr = (l: string) => saved.translations.find((t: { locale: string }) => t.locale === l);
  expect(tr("vi")).toMatchObject({ title: "VI title sửa lại", excerpt: "VI excerpt", slug: viSlug, seoTitle: "VI meta title" });
  expect(tr("en")).toMatchObject({ title: "EN title", excerpt: "EN excerpt", slug: enSlug, seoTitle: "EN meta title" });
});

test("a failed first load (nothing cached) shows the error with a retry that recovers", async ({ page }) => {
  const slug = uniqueSlug("first-load");
  const article = await createArticleViaApi("editor", slug, false);
  await loginViaApi(page, "editor");
  const broken = await breakDetail(page, article.id, "500");
  await page.goto(`/content/articles/${article.id}`);
  await expect(page.getByText(FATAL)).toBeVisible();
  await expect(page.getByText(SERVER_ERROR).first()).toBeVisible();

  await broken.restore();
  await button(page, "Thử lại").click();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue(`Bài viết ${slug}`);
  await expect(page.getByText(FATAL)).toHaveCount(0);
});

test("409 conflict, then the session expires: a failed 'apply mine' keeps the edits and works after re-login", async ({ page }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("conflict-401"), false);
  await openEditor(page, article.id);
  await page.getByPlaceholder(VI_TITLE).fill("Tiêu đề của tôi khi xung đột");

  const other = await apiAs("editor2");
  await other.patch(`/api/v1/admin/articles/${article.id}/draft`, { expectedRevision: article.revision, authorName: "Người khác" });
  await other.dispose();

  await button(page, "Lưu Bản Nháp").click();
  const conflict = page.getByTestId("revision-conflict");
  await expect(conflict).toBeVisible();

  await revokeSession(page);
  await conflict.getByRole("button", { name: "Áp dụng thay đổi của tôi" }).click();
  await expect(page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" })).toBeVisible();
  await expect(page.getByText(FATAL)).toHaveCount(0);
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề của tôi khi xung đột");
  await expect(toast(page, "Không tải được bản mới nhất")).toBeVisible(); // a failed reload is not reported as success
  await relogin(page);
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề của tôi khi xung đột");

  await conflict.getByRole("button", { name: "Áp dụng thay đổi của tôi" }).click();
  await expect(toast(page, "Đã lưu bản nháp (bản #3)")).toBeVisible();
  const saved = await savedDetail(article.id);
  expect(saved).toMatchObject({ revision: 3, authorName: "Người khác" }); // the other editor's change is kept
  expect(saved.translations[0].title).toBe("Tiêu đề của tôi khi xung đột");
});

test("reconnecting after the session expired (refetch answers 401) keeps the edits; they save after re-login", async ({ page, context }) => {
  const article = await createArticleViaApi("editor", uniqueSlug("reconnect-401"), false);
  await openEditor(page, article.id);
  await page.getByPlaceholder(VI_TITLE).fill("Tiêu đề chưa lưu khi hết phiên");

  await revokeSession(page);
  await backgroundRefetch(page, context);
  await expect(page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" })).toBeVisible();
  await expect(page.getByText(FATAL)).toHaveCount(0);
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề chưa lưu khi hết phiên");
  await relogin(page);
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề chưa lưu khi hết phiên");

  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  expect((await savedDetail(article.id)).translations[0].title).toBe("Tiêu đề chưa lưu khi hết phiên");
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, createArticleViaApi, loginViaUi, publicApi, toast, uniqueSlug } from "./helpers";

/**
 * One publish contract (ArticlesService.publish) read the same way by the Article Editor and the Dashboard drawer.
 * Everything runs against the real API; the only stub is a session without `article:publish` (no seeded role has
 * review without publish).
 */

const NOTHING_NEW = "Không có thay đổi mới để xuất bản: bản công khai đã là bản mới nhất.";
const button = (scope: Page | Locator, name: string) => scope.getByRole("button", { name, exact: true });

/** VI draft approved (and optionally published) through the API. */
async function approvedArticle(prefix: string, { publish = false, withEn = false } = {}) {
  const slug = uniqueSlug(prefix);
  const article = await createArticleViaApi("editor", slug, withEn);
  const reviewer = await apiAs("reviewer");
  await reviewer.post(`/api/v1/admin/articles/${article.id}/translations/vi/approve`, { expectedRevision: article.revision });
  if (publish) await reviewer.post(`/api/v1/admin/articles/${article.id}/publish`, { expectedRevision: article.revision });
  await reviewer.dispose();
  return { id: article.id, slug };
}

async function asEditor(fn: (api: Awaited<ReturnType<typeof apiAs>>) => Promise<unknown>, user: "editor" | "editor2" = "editor") {
  const api = await apiAs(user);
  await fn(api);
  await api.dispose();
}

async function detail(id: string) {
  const api = await apiAs("reviewer");
  const d = await api.get(`/api/v1/admin/articles/${id}`);
  await api.dispose();
  return d;
}

/** Cards show the VI title; articles created by `createArticleViaApi` are titled "Bài viết <slug>". */
async function openDrawer(page: Page, slug: string, list: "awaiting" | "all", title = `Bài viết ${slug}`) {
  if (list === "all") await button(page, "Tất cả gần đây").click();
  const card = page.locator("div.rounded-xl").filter({ hasText: title }).first();
  await card.getByRole("button", { name: "Xem & xét duyệt" }).click();
  const drawer = page.getByTestId("quick-review-drawer");
  await expect(drawer).toBeVisible();
  return { drawer, card };
}

const editorPublish = (page: Page) => button(page.getByTestId("article-workflow"), "Xuất bản");
const reason = (scope: Page | Locator) => scope.getByTestId("publish-blocked-reason");

test("A. published with nothing new: neither the drawer nor the editor offers a no-op publish", async ({ page }) => {
  const { id, slug } = await approvedArticle("noop", { publish: true });
  await loginViaUi(page, "reviewer", "/");

  const { drawer } = await openDrawer(page, slug, "all");
  await expect(drawer.getByTestId("drawer-publish-btn")).toBeDisabled();
  await expect(reason(drawer)).toHaveText(NOTHING_NEW);

  await page.goto(`/content/articles/${id}`);
  await expect(editorPublish(page)).toBeDisabled();
  await expect(reason(page)).toHaveText(NOTHING_NEW);
});

test("article-level change (featured) on a published article: publishable in both, and it reaches the public API", async ({ page }) => {
  const { id, slug } = await approvedArticle("featured", { publish: true });
  await asEditor((api) => api.patch(`/api/v1/admin/articles/${id}/draft`, { expectedRevision: 1, isFeatured: true }));
  await loginViaUi(page, "reviewer", "/");

  const { drawer } = await openDrawer(page, slug, "all");
  await expect(drawer.getByTestId("drawer-publish-btn")).toBeEnabled();
  await drawer.getByTestId("drawer-close-btn").click();

  await page.goto(`/content/articles/${id}`);
  await expect(editorPublish(page)).toBeEnabled();
  page.once("dialog", (d) => void d.accept());
  await editorPublish(page).click();
  await expect(toast(page, "Đã xuất bản bài viết")).toBeVisible();
  await expect(reason(page)).toHaveText(NOTHING_NEW); // published state is reflected right away

  const pub = await publicApi();
  expect(await (await pub.get(`/api/v1/public/articles/${slug}-vi?locale=vi`)).json()).toMatchObject({ isFeatured: true });
  await pub.dispose();
});

test("D. a live locale edited without re-approval blocks both surfaces; B. re-approval makes the new revision publishable", async ({ page }) => {
  const { id, slug } = await approvedArticle("live-edit", { publish: true });
  await asEditor((api) =>
    api.patch(`/api/v1/admin/articles/${id}/draft`, {
      expectedRevision: 1,
      translations: [{ locale: "vi", title: "Tiêu đề sửa sau khi công khai" }],
    }),
  );
  await loginViaUi(page, "reviewer", "/");

  const { drawer } = await openDrawer(page, slug, "awaiting", "Tiêu đề sửa sau khi công khai");
  await expect(drawer.getByTestId("drawer-publish-btn")).toBeDisabled();
  await expect(drawer.getByText("cần duyệt lại trước khi xuất bản bản sửa đổi")).toBeVisible();
  await drawer.getByTestId("drawer-close-btn").click();

  await page.goto(`/content/articles/${id}`);
  await expect(editorPublish(page)).toBeDisabled();
  await expect(reason(page)).toHaveText("Bản đang công khai (VI) đã được sửa: cần duyệt lại trước khi xuất bản.");

  await button(page, "Duyệt VI").click();
  await expect(toast(page, "Đã duyệt bản VI")).toBeVisible();
  await expect(editorPublish(page)).toBeEnabled();
  page.once("dialog", (d) => void d.accept());
  await editorPublish(page).click();
  await expect(toast(page, "Đã xuất bản bài viết")).toBeVisible();
  const pub = await publicApi();
  expect(await (await pub.get(`/api/v1/public/articles/${slug}-vi?locale=vi`)).json()).toMatchObject({
    title: "Tiêu đề sửa sau khi công khai",
  });
  await pub.dispose();
});

test("review without publish permission (UI gating): can approve, is never offered publish", async ({ page }) => {
  const slug = uniqueSlug("no-publish");
  const article = await createArticleViaApi("editor", slug, false);
  await loginViaUi(page, "reviewer", "/");
  await page.route(`${E2E.api}/api/v1/auth/session`, async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    session.user.permissions = session.user.permissions.filter((p: string) => p !== "article:publish");
    await route.fulfill({ response, json: session });
  });

  await page.goto(`/content/articles/${article.id}`);
  await button(page, "Duyệt VI").click();
  await expect(toast(page, "Đã duyệt bản VI")).toBeVisible();
  await expect(editorPublish(page)).toHaveCount(0);

  await page.goto("/");
  const { drawer } = await openDrawer(page, slug, "all");
  await expect(drawer.getByText("Bản dịch VI đã duyệt")).toBeVisible();
  await expect(drawer.getByTestId("drawer-publish-btn")).toHaveCount(0);
});

test("409 REVISION_CONFLICT: another editor saved after the drawer opened; nothing is published", async ({ page }) => {
  const { id, slug } = await approvedArticle("publish-conflict");
  await loginViaUi(page, "reviewer", "/");
  const { drawer } = await openDrawer(page, slug, "all");
  await expect(drawer.getByTestId("drawer-publish-btn")).toBeEnabled();

  await asEditor((api) => api.patch(`/api/v1/admin/articles/${id}/draft`, { expectedRevision: 1, authorName: "Người khác" }), "editor2");
  await drawer.getByTestId("drawer-publish-btn").click();
  await page.getByTestId("confirm-publish-btn").click();
  await expect(toast(page, "Không thể xuất bản bài viết")).toBeVisible();
  await expect(drawer.getByText("Xung đột phiên bản nội dung")).toBeVisible();
  expect((await detail(id)).publication).toBeNull();
});

test("the API refuses a publish the UI allowed (archived meanwhile): the reason is shown, nothing is marked published", async ({ page }) => {
  const { id } = await approvedArticle("archived-race");
  await loginViaUi(page, "reviewer", `/content/articles/${id}`);
  await expect(editorPublish(page)).toBeEnabled();

  const reviewer = await apiAs("reviewer");
  await reviewer.post(`/api/v1/admin/articles/${id}/archive`);
  await reviewer.dispose();

  page.once("dialog", (d) => void d.accept());
  await editorPublish(page).click();
  await expect(toast(page, "Thao tác không thành công")).toBeVisible();
  await expect(page.getByText("Bài viết đang ở trạng thái lưu trữ, không thể chỉnh sửa.")).toBeVisible();
  await expect(page.getByTestId("article-workflow").getByText("Đã xuất bản")).toHaveCount(0);
  expect(await detail(id)).toMatchObject({ status: "ARCHIVED", publication: null });
});

test("no double submission: double-clicking publish sends one request, in the drawer and in the editor", async ({ page }) => {
  const a = await approvedArticle("double-drawer");
  const b = await approvedArticle("double-editor");
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/publish")) posts.push(r.url());
  });
  // Slow publish answers widen the window for a second submit.
  await page.route("**/api/v1/admin/articles/*/publish", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });

  await loginViaUi(page, "reviewer", "/");
  const { drawer } = await openDrawer(page, a.slug, "all");
  await drawer.getByTestId("drawer-publish-btn").click();
  await page.getByTestId("confirm-publish-btn").dblclick();
  await expect(toast(page, "Đã xuất bản bài viết lên website công khai!")).toBeVisible();
  expect(posts.filter((u) => u.includes(a.id))).toHaveLength(1);

  await page.goto(`/content/articles/${b.id}`);
  page.on("dialog", (d) => void d.accept());
  await editorPublish(page).dblclick();
  await expect(toast(page, "Đã xuất bản bài viết")).toBeVisible();
  await expect(reason(page)).toHaveText(NOTHING_NEW);
  expect(posts.filter((u) => u.includes(b.id))).toHaveLength(1);
});

test("after publishing in the drawer, the queue and the editor show the same new state", async ({ page }) => {
  const { id, slug } = await approvedArticle("after-publish", { withEn: true }); // EN unapproved: stays in the queue
  await loginViaUi(page, "reviewer", "/");
  const { drawer, card } = await openDrawer(page, slug, "awaiting");
  await drawer.getByTestId("drawer-publish-btn").click();
  await page.getByTestId("confirm-publish-btn").click();
  await expect(toast(page, "Đã xuất bản bài viết lên website công khai!")).toBeVisible();
  await expect(drawer.getByTestId("drawer-publish-btn")).toBeDisabled();
  await expect(reason(drawer)).toHaveText(NOTHING_NEW);
  await drawer.getByTestId("drawer-close-btn").click();

  // The public API serves only the approved locale: the unapproved EN is not reachable, listed or advertised.
  const pub = await publicApi();
  const vi = await pub.get(`/api/v1/public/articles/${slug}-vi?locale=vi`);
  expect(vi.status()).toBe(200);
  expect(((await vi.json()).alternates as { locale: string }[]).map((a) => a.locale)).not.toContain("en");
  expect((await pub.get(`/api/v1/public/articles/${slug}-en?locale=en`)).status()).toBe(404);
  const enList = await (await pub.get(`/api/v1/public/articles?locale=en&pageSize=100`)).json();
  expect((enList.items as { id: string }[]).map((i) => i.id)).not.toContain(id);
  await pub.dispose();

  await expect(card.getByText("Đang công khai")).toBeVisible(); // queue refreshed, EN still awaiting review
  await card.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/content/articles/${id}$`));
  await expect(page.getByTestId("workflow-vi").getByText("Đang công khai")).toBeVisible();
  await expect(editorPublish(page)).toBeDisabled();
  await expect(reason(page)).toHaveText(NOTHING_NEW);
});

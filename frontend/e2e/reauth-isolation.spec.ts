import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import {
  createArticleViaApi,
  createStaffViaApi,
  returnToTab,
  revokeSessionsViaApi,
  toast,
  uniqueSlug,
} from "./helpers";

/**
 * Re-authentication must protect both the unsaved draft and the identity it belongs to: the same user gets the
 * draft back; another account never sees, inherits or submits it; and while nobody is signed in the draft is kept
 * but not readable on screen (shared workstation).
 */

const PASSWORD = "reauth isolation passphrase";
const VI_TITLE = "Nhập tiêu đề bài viết phân tích...";
const SESSION_URL = `${E2E.api}/api/v1/auth/session`;

const expiredDialog = (page: Page) => page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });

/** While nobody is signed in, an opaque layer must cover the whole viewport (a translucent backdrop still reads). */
async function expectDraftHidden(page: Page) {
  const cover = page.getByTestId("reauth-privacy-cover");
  await expect(cover).toBeVisible();
  const opaqueFullScreen = await cover.evaluate((el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    const alpha = bg.startsWith("rgba") ? Number(bg.slice(bg.lastIndexOf(",") + 1, -1)) : 1;
    const r = el.getBoundingClientRect();
    return alpha >= 0.99 && s.position === "fixed" && r.width >= window.innerWidth && r.height >= window.innerHeight;
  });
  expect(opaqueFullScreen).toBe(true);
}

/** Counts draft saves sent from now on. */
function countDraftSaves(page: Page) {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith("/draft")) n++;
  });
  return () => n;
}

async function userAWithDraft(page: Page, prefix: string) {
  const a = await createStaffViaApi(`${prefix}-a`, ["EDITOR"], PASSWORD);
  const article = await createArticleViaApi("editor", uniqueSlug(prefix), false);
  const login = await page.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: a.email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto(`/content/articles/${article.id}`);
  // Unique per test: another test may legitimately save its own draft into the shared test database.
  const secret = `Bản nháp riêng tư của A ${uniqueSlug(prefix)}`;
  const title = page.getByPlaceholder(VI_TITLE);
  await title.fill(secret);
  return { a, article, title, secret };
}

async function articleTitle(page: Page, id: string) {
  const res = await page.request.get(`${E2E.api}/api/v1/admin/articles/${id}`);
  return (await res.json()).translations[0].title as string;
}

test("same-user re-login: the draft is kept but unreadable while signed out, then comes back and saves", async ({ page }) => {
  const { a, title, secret } = await userAWithDraft(page, "reauth-same");
  await revokeSessionsViaApi(a.id);
  await page.getByRole("button", { name: "Lưu Bản Nháp", exact: true }).click();
  const dialog = expiredDialog(page);
  await expect(dialog).toBeVisible();

  await expect(title).toHaveValue(secret); // still mounted
  await expectDraftHidden(page); // but not readable behind the dialog

  await dialog.getByLabel("Mật khẩu").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(dialog).toBeHidden();
  await expect(title).toHaveValue(secret);
  await expect(page.getByTestId("reauth-privacy-cover")).toHaveCount(0);
  await page.getByRole("button", { name: "Lưu Bản Nháp", exact: true }).click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
});

test("different-user re-login: B never sees, inherits or submits A's unsaved draft", async ({ page }) => {
  const { a, article, secret } = await userAWithDraft(page, "reauth-other");
  const b = await createStaffViaApi("reauth-other-b", ["EDITOR"], PASSWORD);
  await revokeSessionsViaApi(a.id);
  await page.getByRole("button", { name: "Lưu Bản Nháp", exact: true }).click();
  const dialog = expiredDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("tài khoản khác"); // the user is told what happens to the draft
  await expectDraftHidden(page);

  const saves = countDraftSaves(page);
  await dialog.getByLabel("Email").fill(b.email);
  await dialog.getByLabel("Mật khẩu").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Tổng quan & Điều hành nội dung" })).toBeVisible();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  expect((await (await page.request.get(SESSION_URL)).json()).user.email).toBe(b.email);
  expect(saves()).toBe(0);
  expect(await articleTitle(page, article.id)).not.toBe(secret); // nothing of A's draft reached the server
});

test("a sign-in as another account in a second tab takes over the first tab safely", async ({ page, context }) => {
  const { article, title, secret } = await userAWithDraft(page, "reauth-tab");
  const b = await createStaffViaApi("reauth-tab-b", ["EDITOR"], PASSWORD);
  const saves = countDraftSaves(page);

  const second = await context.newPage(); // same browser profile: the session cookie is shared
  expect((await second.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: b.email, password: PASSWORD } })).status()).toBe(200);
  await second.close();

  await returnToTab(page); // the first tab re-reads its session and finds B
  await expect(page).toHaveURL(/\/$/);
  await expect(title).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(secret);
  expect((await (await page.request.get(SESSION_URL)).json()).user.email).toBe(b.email);
  expect(saves()).toBe(0);
  expect(await articleTitle(page, article.id)).not.toBe(secret);
});

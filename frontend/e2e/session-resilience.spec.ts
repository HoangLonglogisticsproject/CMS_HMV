import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E } from "./env";
import { createArticleViaApi, createStaffViaApi, returnToTab, setRolesViaApi, toast, uniqueSlug } from "./helpers";

/**
 * The session query (GET /auth/session) refetches in the background: on reconnect once stale, on returning to the tab
 * and after a 403 PERMISSION_DENIED. None of that may take the app (and unsaved work) off screen; 401 still means
 * "sign in again", and permissions on screen follow the server.
 */

const PASSWORD = "session resilience passphrase";
const VI_TITLE = "Nhập tiêu đề bài viết phân tích...";
const EN_TITLE = "Enter English article title...";
const VI_EXCERPT = "Tóm tắt 2-3 câu trọng tâm của bài viết để kích thích người đọc...";
const OFFLINE = "Không kết nối được tới máy chủ API";
const SESSION_URL = `${E2E.api}/api/v1/auth/session`;

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const editor = (page: Page) => page.locator(".ProseMirror");

/** Counts GET /auth/session requests from now on. */
function countSessionRequests(page: Page) {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && r.url() === SESSION_URL) n++;
  });
  return () => n;
}

async function signIn(page: Page, email: string, path: string) {
  const res = await page.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  await page.goto(path);
}

/** Session data is stale after 5 minutes; a network reconnect then refetches it. */
async function staleSessionReconnect(page: Page, context: BrowserContext) {
  await page.clock.fastForward("06:00");
  await context.setOffline(true);
  await context.setOffline(false);
}

async function draftInEditor(page: Page, prefix: string, withEn: boolean) {
  const staff = await createStaffViaApi(prefix, ["EDITOR"], PASSWORD);
  const article = await createArticleViaApi("editor", uniqueSlug(prefix), withEn);
  await page.clock.install();
  await signIn(page, staff.email, `/content/articles/${article.id}`);
  await expect(page.getByPlaceholder(VI_TITLE)).toBeVisible();
  return { staff, article };
}

test("a failed background session refetch keeps the app, the editor and every unsaved field; retry overwrites nothing", async ({
  page,
  context,
}) => {
  await draftInEditor(page, "bg-session", true);
  await page.getByPlaceholder(VI_TITLE).fill("Tiêu đề VI chưa lưu");
  await page.getByPlaceholder(VI_EXCERPT).fill("Tóm tắt VI chưa lưu");
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Đoạn VI chưa lưu.");
  await button(page, "English (EN)").click();
  await page.getByPlaceholder(EN_TITLE).fill("Unsaved EN title");

  await page.route(SESSION_URL, (route) => route.abort("failed"));
  const sessionRequests = countSessionRequests(page);
  await staleSessionReconnect(page, context);
  await expect.poll(sessionRequests).toBeGreaterThan(0);

  const banner = page.getByTestId("session-connection-error");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(OFFLINE);
  await expect(page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" })).toHaveCount(0); // not a sign-out
  await expect(page.getByPlaceholder(EN_TITLE)).toHaveValue("Unsaved EN title");
  await button(page, "Tiếng Việt (VI)").click();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề VI chưa lưu");
  await expect(page.getByPlaceholder(VI_EXCERPT)).toHaveValue("Tóm tắt VI chưa lưu");
  await expect(editor(page)).toContainText("Đoạn VI chưa lưu.");

  // No retry loop while the API stays unreachable.
  const afterFailure = sessionRequests();
  await page.clock.runFor(10_000);
  expect(sessionRequests()).toBe(afterFailure);

  await page.unroute(SESSION_URL);
  await banner.getByRole("button", { name: "Thử lại" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Tiêu đề VI chưa lưu"); // nothing overwritten
  await expect(editor(page)).toContainText("Đoạn VI chưa lưu.");
  await expect(page.getByText("Chưa lưu thay đổi")).toBeVisible();
});

test("a session that never loaded shows an error with retry, not the app", async ({ page }) => {
  const staff = await createStaffViaApi("first-session", ["EDITOR"], PASSWORD);
  const login = await page.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: staff.email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await page.route(SESSION_URL, (route) => route.abort("failed"));
  await page.goto("/content/articles");
  await expect(page.getByText(OFFLINE)).toBeVisible();
  await expect(page.locator("aside")).toHaveCount(0); // the app is not shown before the session is known
  await page.unroute(SESSION_URL);
  await button(page, "Thử lại").click();
  await expect(page.locator("aside")).toBeVisible();
});

test("a revoked session (401) still asks to sign in again in place and keeps the draft", async ({ page, context }) => {
  await draftInEditor(page, "revoked-session", false);
  await page.getByPlaceholder(VI_TITLE).fill("Bản nháp khi phiên bị thu hồi");
  const { csrfToken } = await (await page.request.get(SESSION_URL)).json();
  expect((await page.request.post(`${E2E.api}/api/v1/auth/logout`, { headers: { "X-CSRF-Token": csrfToken } })).status()).toBe(204);

  await staleSessionReconnect(page, context);
  const dialog = page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("session-connection-error")).toHaveCount(0); // 401 is not a network problem
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Bản nháp khi phiên bị thu hồi");
  await dialog.getByLabel("Mật khẩu").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Bản nháp khi phiên bị thu hồi");
});

test("demoted to VIEWER while editing: the server refuses the save, the session refreshes once, the draft stays", async ({
  page,
}) => {
  const { staff } = await draftInEditor(page, "demoted", false);
  await page.getByPlaceholder(VI_TITLE).fill("Bản nháp trước khi bị hạ quyền");
  await setRolesViaApi(staff.id, ["VIEWER"]);
  const sessionRequests = countSessionRequests(page);

  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Không thể lưu bài viết")).toBeVisible();
  await expect(page.getByText("Tài khoản của bạn không có quyền thực hiện thao tác này.").first()).toBeVisible();
  await expect.poll(sessionRequests).toBe(1); // refreshed after PERMISSION_DENIED
  await expect(button(page, "Lưu Bản Nháp")).toBeDisabled(); // the UI now matches the server
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Bản nháp trước khi bị hạ quyền"); // editor not reset

  await page.clock.runFor(10_000);
  expect(sessionRequests()).toBe(1); // no refetch loop
  const session = await (await page.request.get(SESSION_URL)).json();
  expect(session.user.roles).toEqual(["VIEWER"]);
});

test("promoted while the tab was in the background: returning to the tab refreshes permissions without resetting the editor", async ({
  page,
}) => {
  const viewer = await createStaffViaApi("promoted", ["VIEWER"], PASSWORD);
  const article = await createArticleViaApi("editor", uniqueSlug("promoted"), false);
  await signIn(page, viewer.email, `/content/articles/${article.id}`);
  await expect(button(page, "Lưu Bản Nháp")).toBeDisabled();
  await page.getByPlaceholder(VI_TITLE).fill("Gõ trước khi được nâng quyền");

  await setRolesViaApi(viewer.id, ["EDITOR"]);
  const sessionRequests = countSessionRequests(page);
  await returnToTab(page);
  await expect.poll(sessionRequests).toBeGreaterThan(0);
  await expect(button(page, "Lưu Bản Nháp")).toBeEnabled();
  await expect(page.getByPlaceholder(VI_TITLE)).toHaveValue("Gõ trước khi được nâng quyền");

  await button(page, "Lưu Bản Nháp").click();
  await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
});

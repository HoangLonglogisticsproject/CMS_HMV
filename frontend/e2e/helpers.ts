import { expect, request as playwrightRequest, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, type E2EUser } from "./env";

export { makePng } from "../../backend/test/fixtures";

/** Signs in through the real login form. */
export async function loginViaUi(page: Page, user: E2EUser, next = "/content/articles") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(E2E.users[user].email);
  await page.getByLabel("Mật khẩu").fill(E2E.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/]/g, "\\/")}$`));
}

/** Signs a browser context in via the API (cookie lands in the context; the app re-reads the CSRF token). */
export async function loginViaApi(page: Page, user: E2EUser) {
  const res = await page.request.post(`${E2E.api}/api/v1/auth/login`, {
    data: { email: E2E.users[user].email, password: E2E.password },
  });
  expect(res.status()).toBe(200);
}

/** Signs out via the Account Dropdown in the Header. */
export async function logoutViaUi(page: Page) {
  await page.getByRole("button", { name: "Tài khoản người dùng" }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login/);
}



/** A non-browser API client signed in as `user`, for arranging data and asserting server state. */
export async function apiAs(user: E2EUser) {
  const ctx: APIRequestContext = await playwrightRequest.newContext({ baseURL: E2E.api });
  const login = await ctx.post("/api/v1/auth/login", { data: { email: E2E.users[user].email, password: E2E.password } });
  expect(login.status()).toBe(200);
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  const headers = { "X-CSRF-Token": csrfToken };
  // Test assertions walk response JSON freely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = async (res: Awaited<ReturnType<APIRequestContext["get"]>>, status = 200): Promise<any> => {
    expect(res.status(), await res.text()).toBe(status);
    return res.status() === 204 ? null : res.json();
  };
  return {
    ctx,
    get: (path: string, status?: number) => ctx.get(path).then((r) => json(r, status)),
    post: (path: string, data?: object, status?: number) => ctx.post(path, { data, headers }).then((r) => json(r, status)),
    patch: (path: string, data: object, status?: number) => ctx.patch(path, { data, headers }).then((r) => json(r, status)),
    dispose: () => ctx.dispose(),
  };
}

/** Unauthenticated client for the public content API. */
export const publicApi = () => playwrightRequest.newContext({ baseURL: E2E.api });

export const uniqueSlug = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Creates a VI(+EN) draft through the API and returns its detail. */
export async function createArticleViaApi(user: E2EUser, slug: string, withEn = true) {
  const api = await apiAs(user);
  const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const translations = [{ locale: "vi", title: `Bài viết ${slug}`, slug: `${slug}-vi`, content: doc("Nội dung tiếng Việt") }];
  if (withEn) translations.push({ locale: "en", title: `Article ${slug}`, slug: `${slug}-en`, content: doc("English content") });
  const detail = await api.post("/api/v1/admin/articles", { categoryCode: "SUPPLY_CHAIN_INSIGHTS", translations }, 201);
  await api.dispose();
  return detail as { id: string; revision: number };
}

export const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

/** A throwaway account created through the admin API on the _test database (never one of the shared E2E users). */
export async function createStaffViaApi(prefix: string, roles: string[], password: string) {
  const email = `${uniqueSlug(prefix)}@e2e.test`;
  const admin = await apiAs("admin");
  const user = await admin.post("/api/v1/admin/users", { email, displayName: "Nhân Viên Tạm", roles, password }, 201);
  await admin.dispose();
  return { id: user.id as string, email };
}

/** Replaces a user's roles through the admin API (takes effect on the server immediately). */
export async function setRolesViaApi(userId: string, roles: string[]) {
  const admin = await apiAs("admin");
  await admin.patch(`/api/v1/admin/users/${userId}`, { roles });
  await admin.dispose();
}

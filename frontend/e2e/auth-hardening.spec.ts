import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, createArticleViaApi, createStaffViaApi, loginViaUi, toast, uniqueSlug } from "./helpers";

// Throwaway staff accounts are created through the admin API on the _test database; shared E2E users stay untouched.
const PASSWORD_A = "first passphrase for staff";
const PASSWORD_B = "second passphrase for staff";
const USERS_NAV = "Người dùng & phân quyền";

const staffAccount = (roles: string[] = ["EDITOR"]) => createStaffViaApi("staff", roles, PASSWORD_A);

/** Status of a sign-in attempt through the API (no browser state involved). */
async function loginStatus(email: string, password: string) {
  const ctx = await playwrightRequest.newContext({ baseURL: E2E.api });
  const res = await ctx.post("/api/v1/auth/login", { data: { email, password } });
  await ctx.dispose();
  return res.status();
}

async function signInAs(page: Page, email: string, password: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/]/g, "\\/")}$`));
}

const accountMenu = (page: Page) => page.getByRole("button", { name: "Tài khoản người dùng" });

test("an expired session shows no identity (never a fake admin) until the user signs in again", async ({ page }) => {
  const staff = await staffAccount();
  const article = await createArticleViaApi("editor", uniqueSlug("expiry-identity"), false);
  await signInAs(page, staff.email, PASSWORD_A, `/content/articles/${article.id}`);
  await expect(accountMenu(page)).toContainText("Nhân Viên Tạm");

  const admin = await apiAs("admin");
  await admin.post(`/api/v1/admin/users/${staff.id}/sessions/revoke`, undefined, 200);
  await admin.dispose();
  await page.getByPlaceholder("Nhập tiêu đề bài viết phân tích...").fill("Tiêu đề khi phiên bị thu hồi");
  await page.getByRole("button", { name: "Lưu Bản Nháp" }).click();

  const dialog = page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });
  await expect(dialog).toBeVisible();
  // The modal marks the rest of the page aria-hidden, so look the header up by CSS rather than by role.
  const header = page.locator("header [aria-label=\"Tài khoản người dùng\"]");
  await expect(header).toContainText("Phiên đã hết hạn");
  await expect(header).not.toContainText(/ADMIN|EDITOR|Nhân Viên Tạm/);
  // No identity at all while signed out: no placeholder admin name and no email anywhere in the shell.
  for (const fake of ["HMV Administrator", "Admin User"]) await expect(page.getByText(fake)).toHaveCount(0);
  await expect(header).not.toContainText("@");
  await expect(page.locator("aside")).not.toContainText("@");

  await dialog.getByLabel("Mật khẩu").fill(PASSWORD_A);
  await dialog.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(dialog).toBeHidden();
  await expect(accountMenu(page)).toContainText("Nhân Viên Tạm");
  await expect(page.getByPlaceholder("Nhập tiêu đề bài viết phân tích...")).toHaveValue("Tiêu đề khi phiên bị thu hồi");
});

test("staff change their own password: a wrong current one is refused in place, other sessions end, this one stays", async ({
  page,
  browser,
}) => {
  const staff = await staffAccount();
  const other = await browser.newContext();
  const otherLogin = await other.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: staff.email, password: PASSWORD_A } });
  expect(otherLogin.status()).toBe(200);

  await signInAs(page, staff.email, PASSWORD_A);
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Đổi mật khẩu" }).click();
  const dialog = page.getByRole("dialog", { name: "Đổi mật khẩu" });
  await dialog.getByLabel("Mật khẩu hiện tại").fill("not my password at all");
  await dialog.getByLabel("Mật khẩu mới (ít nhất 12 ký tự)").fill(PASSWORD_B);
  await dialog.getByLabel("Nhập lại mật khẩu mới").fill(PASSWORD_B);
  await dialog.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Mật khẩu hiện tại không đúng.");
  await expect(page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" })).toHaveCount(0); // 403, not a session expiry

  await dialog.getByLabel("Mật khẩu hiện tại").fill(PASSWORD_A);
  await dialog.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(toast(page, "Đã đổi mật khẩu")).toBeVisible();
  await expect(dialog).toBeHidden();

  expect((await other.request.get(`${E2E.api}/api/v1/auth/session`)).status()).toBe(401); // the other session ended
  await other.close();
  await page.goto("/content/articles");
  await expect(accountMenu(page)).toContainText("Nhân Viên Tạm"); // this one stays
  expect(await loginStatus(staff.email, PASSWORD_A)).toBe(401);
  expect(await loginStatus(staff.email, PASSWORD_B)).toBe(200);
});

test("an admin creates, deactivates, reactivates and resets staff accounts from the UI", async ({ page }) => {
  const email = `${uniqueSlug("new-staff")}@e2e.test`;
  await loginViaUi(page, "admin", "/");
  await page.locator("aside").getByRole("link", { name: USERS_NAV }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByTestId(`user-row-${E2E.users.admin.email}`)).toBeVisible();

  await page.getByRole("button", { name: "Thêm người dùng" }).click();
  const create = page.getByRole("dialog", { name: "Thêm người dùng" });
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Tên hiển thị").fill("Biên Tập Mới");
  await create.getByLabel(/^EDITOR/).check();
  await create.getByLabel("Mật khẩu (ít nhất 12 ký tự)").fill(PASSWORD_A);
  await create.getByLabel("Nhập lại mật khẩu").fill(PASSWORD_A);
  await create.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(toast(page, `Đã tạo tài khoản ${email}`)).toBeVisible();
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toContainText("EDITOR");
  expect(await loginStatus(email, PASSWORD_A)).toBe(200);

  page.once("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Khoá", exact: true }).click();
  await expect(row).toContainText("Đã khoá");
  expect(await loginStatus(email, PASSWORD_A)).toBe(401);

  await row.getByRole("button", { name: "Mở khoá", exact: true }).click();
  await expect(row).toContainText("Đang hoạt động");
  expect(await loginStatus(email, PASSWORD_A)).toBe(200);

  await row.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  const reset = page.getByRole("dialog", { name: `Đặt lại mật khẩu: ${email}` });
  await reset.getByLabel("Mật khẩu (ít nhất 12 ký tự)").fill(PASSWORD_B);
  await reset.getByLabel("Nhập lại mật khẩu").fill(PASSWORD_B);
  await reset.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(toast(page, `Đã đặt lại mật khẩu cho ${email}`)).toBeVisible();
  expect(await loginStatus(email, PASSWORD_A)).toBe(401);
  expect(await loginStatus(email, PASSWORD_B)).toBe(200);

  const events = page.getByTestId("security-events");
  for (const label of ["Tạo tài khoản", "Khoá tài khoản", "Mở khoá tài khoản", "Đặt lại mật khẩu"])
    await expect(events.getByText(label, { exact: true }).first()).toBeVisible();
});

test("the last admin cannot lock themselves out", async ({ page }) => {
  await loginViaUi(page, "admin", "/admin/users");
  const self = page.getByTestId(`user-row-${E2E.users.admin.email}`);
  page.once("dialog", (d) => void d.accept());
  await self.getByRole("button", { name: "Khoá (chính bạn)" }).click();
  await expect(toast(page, "Không thể đổi trạng thái")).toBeVisible();
  await expect(page.getByText("Phải còn ít nhất một quản trị viên đang hoạt động").first()).toBeVisible();
  await expect(self).toContainText("Đang hoạt động");
  expect(await loginStatus(E2E.users.admin.email, E2E.password)).toBe(200);
});

test("non-admins get no menu entry, the page refuses, and the API answers 403", async ({ page }) => {
  await loginViaUi(page, "editor", "/");
  await expect(page.locator("aside").getByRole("link", { name: USERS_NAV })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByTestId("users-forbidden")).toBeVisible();

  const list = await page.request.get(`${E2E.api}/api/v1/admin/users`);
  expect(list.status()).toBe(403);
  expect((await list.json()).code).toBe("PERMISSION_DENIED");
  const { csrfToken, user } = await (await page.request.get(`${E2E.api}/api/v1/auth/session`)).json();
  const promote = await page.request.patch(`${E2E.api}/api/v1/admin/users/${user.id}`, {
    data: { roles: ["ADMIN"] },
    headers: { "X-CSRF-Token": csrfToken, Origin: E2E.web },
  });
  expect(promote.status()).toBe(403);
  expect((await promote.json()).code).toBe("PERMISSION_DENIED");
  expect((await (await page.request.get(`${E2E.api}/api/v1/auth/session`)).json()).user.roles).toEqual(["EDITOR"]);
});

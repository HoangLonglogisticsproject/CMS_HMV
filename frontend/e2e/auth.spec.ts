import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import { createArticleViaApi, loginViaApi, loginViaUi, toast, uniqueSlug } from "./helpers";

test.describe("Authentication (real API + PostgreSQL)", () => {
  test("protected routes redirect to login; wrong password is reported; login returns to the page", async ({ page }) => {
    await page.goto("/content/media");
    await expect(page).toHaveURL(/\/login\?next=%2Fcontent%2Fmedia$/);

    await page.getByLabel("Email").fill(E2E.users.editor.email);
    await page.getByLabel("Mật khẩu").fill("definitely-wrong");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByText("Email hoặc mật khẩu không đúng.")).toBeVisible();

    await page.getByLabel("Mật khẩu").fill(E2E.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/content\/media$/);
    await expect(page.getByRole("banner").getByText(E2E.users.editor.name)).toBeVisible();

    // The session cookie is HttpOnly: page scripts cannot read it.
    const cookies = await page.context().cookies(E2E.api);
    expect(cookies.find((c) => c.name === "hmv_session")).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    expect(await page.evaluate(() => document.cookie)).not.toContain("hmv_session");
  });

  test("logout via Account Dropdown revokes session server-side, clears client, and prevents re-auth on refresh", async ({
    page,
  }) => {
    await loginViaUi(page, "editor");

    // 1. Verify Quick Logout button on far-right has been removed (no duplicate logout)
    await expect(page.locator("header").getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);

    // 2. Open Account Dropdown via user trigger (avatar/name)
    const trigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // 3. Verify Account Dropdown structure matches specification
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText(E2E.users.editor.name)).toBeVisible();
    await expect(menu.getByText(E2E.users.editor.email)).toBeVisible();
    await expect(menu.getByText("EDITOR", { exact: true })).toBeVisible();


    const logoutItem = menu.getByRole("menuitem", { name: "Đăng xuất" });
    await expect(logoutItem).toBeVisible();

    // 4. Perform logout
    await logoutItem.click();
    await expect(page).toHaveURL(/\/login/);

    // 5. Server-side session revocation: cookie no longer authenticates
    const res = await page.request.get(`${E2E.api}/api/v1/auth/session`);
    expect(res.status()).toBe(401);

    // 6. Refreshing browser does not auto-login
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    const reloadRes = await page.request.get(`${E2E.api}/api/v1/auth/session`);
    expect(reloadRes.status()).toBe(401);

    // 7. Protected route redirects to login
    await page.goto("/content/articles");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("logout via Account Dropdown on Mobile (390x844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, "editor");

    // Header has compact avatar trigger, no quick logout button
    await expect(page.locator("header").getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);
    const trigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText(E2E.users.editor.name)).toBeVisible();

    await menu.getByRole("menuitem", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login/);

    const res = await page.request.get(`${E2E.api}/api/v1/auth/session`);
    expect(res.status()).toBe(401);
  });

  test("Account Dropdown keyboard accessibility navigation and logout", async ({ page }) => {
    await loginViaUi(page, "editor");

    // Focus trigger button with keyboard
    const trigger = page.getByRole("button", { name: "Tài khoản người dùng" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    // Dropdown opens
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // Navigate to menu item via ArrowDown and press Enter
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/login/);
    const res = await page.request.get(`${E2E.api}/api/v1/auth/session`);
    expect(res.status()).toBe(401);
  });


  test("an expired session keeps unsaved work and asks to sign in again in place", async ({ page }) => {
    const article = await createArticleViaApi("editor", uniqueSlug("expiry"), false);
    await loginViaApi(page, "editor");
    await page.goto(`/content/articles/${article.id}`);
    const title = page.getByPlaceholder("Nhập tiêu đề bài viết phân tích...");
    await title.fill("Tiêu đề đang soạn dở khi hết phiên");

    // Revoke this browser's session behind the app's back (as an admin or expiry would).
    const { csrfToken } = await (await page.request.get(`${E2E.api}/api/v1/auth/session`)).json();
    const revoked = await page.request.post(`${E2E.api}/api/v1/auth/logout`, { headers: { "X-CSRF-Token": csrfToken } });
    expect(revoked.status()).toBe(204);

    await page.getByRole("button", { name: "Lưu Bản Nháp" }).click();
    const dialog = page.getByRole("dialog", { name: "Phiên đăng nhập đã hết hạn" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Email")).toHaveValue(E2E.users.editor.email);
    await dialog.getByLabel("Mật khẩu").fill(E2E.password);
    await dialog.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(dialog).toBeHidden();

    await expect(title).toHaveValue("Tiêu đề đang soạn dở khi hết phiên"); // nothing was lost
    await page.getByRole("button", { name: "Lưu Bản Nháp" }).click();
    await expect(toast(page, "Đã lưu bản nháp (bản #2)")).toBeVisible();
  });

  test("permission-aware UI: a viewer can read but gets no write actions", async ({ page }) => {
    const article = await createArticleViaApi("editor", uniqueSlug("viewer"));
    await loginViaUi(page, "viewer");
    await expect(page.getByRole("button", { name: "Tạo Bài Viết Mới" })).toHaveCount(0);
    await page.goto(`/content/articles/${article.id}`);
    await expect(page.getByRole("button", { name: "Lưu Bản Nháp" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Duyệt/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toHaveCount(0);
    await page.goto("/content/media");
    await expect(page.getByRole("button", { name: "Tải Lên Ảnh" })).toHaveCount(0);
  });
});

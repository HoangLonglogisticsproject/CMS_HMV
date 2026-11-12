import { createHash, createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, loginViaUi, publicApi } from "./helpers";

// The website side of the integration, as its server adapter sends it: the body serialized once, and that exact string
// signed (HMAC-SHA256 of "<timestamp>.<idempotency key>.<SHA-256 of the body>") and sent.
async function ingestInquiry(company: string) {
  const key = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
      locale: "en",
      goal: "sourcing",
      productId: "dried-cassava-chips",
      origin: "cambodia",
      volume: { amount: "5000", unit: "mt_month" },
      application: "feed",
      requirements: { starch: "70", incoterm: "CIF" },
      notes: "Monthly contract, samples first.",
      contact: { company, email: "buyer@example.com", phone: "+84 909 000 000" },
      source: { landingPage: "/products/dried-cassava-chips", utm: { source: "linkedin" } },
      consentAt: new Date().toISOString(),
  });
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const ctx = await publicApi();
  const res = await ctx.post("/api/v1/integrations/trade-inquiries", {
    headers: {
      "Content-Type": "application/json",
      "X-HMV-Timestamp": ts,
      "X-HMV-Signature": createHmac("sha256", E2E.ingestSecret).update(`${ts}.${key}.${bodyHash}`).digest("hex"),
      "Idempotency-Key": key,
    },
    data: body,
  });
  expect(res.status(), await res.text()).toBe(201);
  const { reference } = (await res.json()) as { reference: string };
  await ctx.dispose();
  return reference;
}

test("a website inquiry reaches the sales inbox; sales qualifies, assigns and notes it", async ({ page }) => {
  const company = `Feed Co ${randomUUID().slice(0, 8)}`;
  const reference = await ingestInquiry(company);

  await loginViaUi(page, "sales", "/sales/inquiries");
  await expect(page.locator("aside").getByRole("link", { name: "Yêu cầu giao thương" })).toBeVisible();
  await page.getByLabel("Tìm yêu cầu").fill(company);
  const row = page.getByTestId("inquiry-row").filter({ hasText: reference });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Dried cassava chips");
  await expect(row).toContainText("5000 MT / month");
  await expect(row).toContainText("utm: linkedin");
  await expect(row).toContainText("Chưa giao");

  await row.getByRole("link", { name: reference }).click();
  await expect(page).toHaveURL(/\/sales\/inquiries\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("inquiry-reference")).toHaveText(reference);
  await expect(page.getByTestId("inquiry-status")).toHaveText("Mới");
  await expect(page.getByTestId("inquiry-missing")).toContainText("Người liên hệ");
  await expect(page.getByTestId("inquiry-missing")).toContainText("Điểm đến");
  await expect(page.getByText("Required starch %")).toBeVisible();
  await expect(page.getByRole("link", { name: "Gửi email cho người mua" })).toHaveAttribute(
    "href",
    new RegExp(`^mailto:buyer@example\\.com\\?subject=.*${reference}`),
  );
  await expect(page.getByRole("link", { name: "Mở WhatsApp" })).toHaveAttribute("href", "https://wa.me/84909000000");
  await expect(page.getByTestId("inquiry-notification")).toHaveText("Email thông báo đang tắt");

  await page.getByLabel("Trạng thái").selectOption("CONTACTED");
  await expect(page.getByTestId("inquiry-status")).toHaveText("Đã liên hệ");
  await page.getByLabel("Người phụ trách").selectOption({ label: E2E.users.sales.name });
  await expect(page.getByLabel("Người phụ trách")).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel("Ghi chú mới").fill("Called the buyer; sending the cassava spec sheet.");
  await page.getByRole("button", { name: "Thêm ghi chú" }).click();
  await expect(page.getByTestId("inquiry-note")).toContainText("sending the cassava spec sheet");

  // Deep link: a reload reads everything back from the API.
  const detailUrl = page.url();
  await page.reload();
  await expect(page.getByTestId("inquiry-status")).toHaveText("Đã liên hệ");
  await expect(page.getByLabel("Người phụ trách").locator("option:checked")).toHaveText(E2E.users.sales.name);
  await expect(page.getByTestId("inquiry-note")).toHaveCount(1);

  // Back in the list, the row reflects the work.
  await page.goto("/sales/inquiries");
  await page.getByLabel("Tìm yêu cầu").fill(company);
  await expect(row).toContainText("Đã liên hệ");
  await expect(row).toContainText(E2E.users.sales.name);

  // The changes are on the server, not just in the cache.
  const api = await apiAs("sales");
  const detail = await api.get(`/api/v1/admin/trade-inquiries/${detailUrl.split("/").pop()}`);
  expect(detail).toMatchObject({ reference, status: "CONTACTED", assignedTo: { displayName: E2E.users.sales.name } });
  await api.dispose();
});

test("an editor has no sales inbox: no menu entry, a forbidden page, and the API refuses", async ({ page }) => {
  await loginViaUi(page, "editor", "/sales/inquiries");
  await expect(page.getByTestId("inquiries-forbidden")).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Yêu cầu giao thương" })).toHaveCount(0);
  const api = await apiAs("editor");
  await api.get("/api/v1/admin/trade-inquiries", 403);
  await api.dispose();
});

test("a deep link to an inquiry survives sign-in", async ({ page }) => {
  const reference = await ingestInquiry(`Deep Link Co ${randomUUID().slice(0, 8)}`);
  const api = await apiAs("sales");
  const { items } = await api.get(`/api/v1/admin/trade-inquiries?search=${reference}`);
  await api.dispose();
  const path = `/sales/inquiries/${items[0].id}`;

  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(E2E.users.sales.email);
  await page.getByLabel("Mật khẩu").fill(E2E.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByTestId("inquiry-reference")).toHaveText(reference);
});

test("on page 2, a poll that shrinks the results to one page moves to page 1 (never 'Trang 2/1')", async ({ page }) => {
  await page.clock.install();
  const prefix = `Clamp ${randomUUID().slice(0, 8)}`;
  for (let i = 0; i < 21; i++) await ingestInquiry(`${prefix} ${String(i).padStart(2, "0")}`);

  await loginViaUi(page, "sales", "/sales/inquiries");
  await page.getByLabel("Trạng thái").selectOption("NEW");
  await page.getByLabel("Tìm yêu cầu").fill(prefix);
  await page.clock.runFor(400); // the search debounce
  const pager = page.getByTestId("inquiries-pagination");
  await expect(pager).toHaveText("21 yêu cầu · Trang 1/2");
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(pager).toHaveText("21 yêu cầu · Trang 2/2");
  await expect(page.getByTestId("inquiry-row")).toHaveCount(1);
  // Every text the pager shows from here on.
  await pager.evaluate((el) => {
    const seen: string[] = [];
    (window as unknown as { pagerSeen: string[] }).pagerSeen = seen;
    new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { subtree: true, characterData: true, childList: true });
  });

  // Elsewhere, one inquiry leaves the filter: 20 left, one page.
  const api = await apiAs("sales");
  const { items } = await api.get(`/api/v1/admin/trade-inquiries?search=${encodeURIComponent(prefix)}&pageSize=1`);
  await api.patch(`/api/v1/admin/trade-inquiries/${items[0].id}`, { status: "CONTACTED" });
  await api.dispose();

  await page.clock.runFor(31_000); // the 30 s poll
  await expect(pager).toHaveText("20 yêu cầu · Trang 1/1");
  await expect(page.getByTestId("inquiry-row")).toHaveCount(20);
  const seen = await page.evaluate(() => (window as unknown as { pagerSeen: string[] }).pagerSeen);
  expect(seen.filter((t) => t.includes("Trang 2/1"))).toEqual([]);
});

test("a note being saved: the box is locked, then cleared; it never loses newer text", async ({ page }) => {
  const reference = await ingestInquiry(`Note Co ${randomUUID().slice(0, 8)}`);
  const api = await apiAs("sales");
  const { items } = await api.get(`/api/v1/admin/trade-inquiries?search=${reference}`);
  await api.dispose();

  // Hold the note request until the test releases it.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/admin/trade-inquiries/*/notes", async (route) => {
    await held;
    await route.continue();
  });

  await loginViaUi(page, "sales", `/sales/inquiries/${items[0].id}`);
  const box = page.getByLabel("Ghi chú mới");
  await box.fill("First call done.");
  await page.getByRole("button", { name: "Thêm ghi chú" }).click();
  await expect(box).toBeDisabled();
  await expect(box).toHaveValue("First call done.");
  release();
  await expect(page.getByTestId("inquiry-note")).toContainText("First call done.");
  await expect(box).toBeEnabled();
  await expect(box).toHaveValue("");
});

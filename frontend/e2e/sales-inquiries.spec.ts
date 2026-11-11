import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, loginViaUi, publicApi } from "./helpers";

// The website side of the integration, as its server adapter sends it: HMAC-SHA256 of "<timestamp>.<idempotency key>".
async function ingestInquiry(company: string) {
  const key = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const ctx = await publicApi();
  const res = await ctx.post("/api/v1/integrations/trade-inquiries", {
    headers: {
      "X-HMV-Timestamp": ts,
      "X-HMV-Signature": createHmac("sha256", E2E.ingestSecret).update(`${ts}.${key}`).digest("hex"),
      "Idempotency-Key": key,
    },
    data: {
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
    },
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

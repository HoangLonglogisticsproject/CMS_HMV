import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E } from "./env";
import { apiAs, createArticleViaApi, createStaffViaApi, returnToTab, uniqueSlug } from "./helpers";

/**
 * Cross-tab identity race with real cookies: tab A has user A's screen (and A's CSRF token in memory), then another
 * tab of the same browser signs in as B, so the session cookie now belongs to B. Before tab A re-reads its session,
 * the user fires a write from it. The server must not run it as B; the tab must then hand over safely.
 */

const PASSWORD = "cross tab race passphrase";
const ROLES = ["EDITOR", "REVIEWER"]; // write + review + publish: a write accepted as B would succeed
const VI_TITLE = "Nhập tiêu đề bài viết phân tích...";

// PATCH …/draft, POST …/translations/vi/approve, POST …/publish
const WRITES = {
  save: /\/draft$/,
  approve: /\/translations\/vi\/approve$/,
  publish: /\/publish$/,
} as const;

/** Tab A shows A's editor (with an unsaved draft for a save); then B signs in from another tab of the same browser. */
async function aThenBInAnotherTab(page: Page, context: BrowserContext, action: keyof typeof WRITES) {
  const a = await createStaffViaApi(`race-${action}-a`, ROLES, PASSWORD);
  const b = await createStaffViaApi(`race-${action}-b`, ROLES, PASSWORD);
  const article = await createArticleViaApi("editor", uniqueSlug(`race-${action}`), false);
  if (action === "publish") {
    const reviewer = await apiAs("reviewer");
    await reviewer.post(`/api/v1/admin/articles/${article.id}/translations/vi/approve`, { expectedRevision: 1 });
    await reviewer.dispose();
  }
  const before = await detail(article.id);

  // Tab A: user A's editor; for a save, an unsaved draft.
  expect((await page.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: a.email, password: PASSWORD } })).status()).toBe(200);
  await page.goto(`/content/articles/${article.id}`);
  const draft = `Bản nháp của A (${action}) ${uniqueSlug("x")}`;
  if (action === "save") await page.getByPlaceholder(VI_TITLE).fill(draft);

  // Another tab of the same browser signs in as B: the cookie switches; tab A has not re-read its session.
  const second = await context.newPage();
  expect((await second.request.post(`${E2E.api}/api/v1/auth/login`, { data: { email: b.email, password: PASSWORD } })).status()).toBe(200);
  await second.close();
  return { a, b, article, before, draft };
}

/**
 * The server's answers to a write, read in the test process: a refused write makes the tab reload (handing over to B),
 * and the browser then discards the response, so `page.waitForResponse(...).json()` would race the reload.
 */
async function serverAnswers(page: Page, path: RegExp) {
  const answers: { status: number; code?: string }[] = [];
  await page.route(path, async (route) => {
    const response = await route.fetch(); // the same request: B's cookie, the tab's CSRF token
    answers.push({ status: response.status(), code: (await response.json().catch(() => ({}))).code });
    await route.fulfill({ response }).catch(() => undefined); // the tab may already be reloading
  });
  return answers;
}

async function staleTabWrite(page: Page, context: BrowserContext, action: keyof typeof WRITES) {
  const setup = await aThenBInAnotherTab(page, context, action);
  const answers = await serverAnswers(page, WRITES[action]);
  const workflow = page.getByTestId("article-workflow");
  if (action === "save") await page.getByRole("button", { name: "Lưu Bản Nháp", exact: true }).click();
  if (action === "approve") await workflow.getByRole("button", { name: "Duyệt VI", exact: true }).click();
  if (action === "publish") {
    page.once("dialog", (d) => void d.accept());
    await workflow.getByRole("button", { name: "Xuất bản", exact: true }).click();
  }
  await expect.poll(() => answers.length).toBe(1);
  return { ...setup, answer: answers[0] };
}

async function detail(id: string) {
  const admin = await apiAs("admin");
  const d = await admin.get(`/api/v1/admin/articles/${id}`);
  await admin.dispose();
  return d;
}

for (const action of Object.keys(WRITES) as (keyof typeof WRITES)[]) {
  test(`${action} from a tab whose session was replaced by another account is refused, nothing is written as B`, async ({
    page,
    context,
  }) => {
    const { b, article, before, draft, answer } = await staleTabWrite(page, context, action);

    // The request is sent with B's cookie but A's CSRF token: the server refuses it.
    expect(answer).toEqual({ status: 403, code: "CSRF_TOKEN_INVALID" });

    // Server state: unchanged, and nothing attributed to B.
    const after = await detail(article.id);
    expect(after.revision).toBe(before.revision);
    expect(after.updatedBy.id).not.toBe(b.id);
    expect(after.updatedBy.id).toBe(before.updatedBy.id);
    expect(after.translations[0].title).toBe(before.translations[0].title);
    expect(after.translations[0].reviewStatus).toBe(before.translations[0].reviewStatus);
    expect(after.publication).toEqual(before.publication);
    console.log(`RACE ${action} article=${article.id} b=${b.id}`);

    // The refusal tells the tab its session changed: it hands over to B without A's screen or draft.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByPlaceholder(VI_TITLE)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(draft);
  });
}

test("a save clicked in the instant the tab learns about B (before the screen switches) is not sent as B", async ({
  page,
  context,
}) => {
  const { b, article, before, draft } = await aThenBInAnotherTab(page, context, "save");
  // Land the click right after the session answer (B) is read and before React re-renders: the earliest moment a real
  // click can arrive once the tab has learned about B, while A's editor is still on screen.
  await page.evaluate(() => {
    let fired = false;
    const proto = Response.prototype as unknown as Record<"json" | "text", (this: Response) => Promise<unknown>>;
    for (const method of ["json", "text"] as const) {
      const read = proto[method];
      proto[method] = async function (this: Response) {
        const body = await read.call(this);
        if (!fired && new URL(this.url).pathname === "/api/v1/auth/session") {
          fired = true;
          setTimeout(() => [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Lưu Bản Nháp")?.click());
        }
        return body;
      };
    }
  });
  const answers = await serverAnswers(page, WRITES.save);
  await returnToTab(page); // the tab re-reads its session and gets B
  await expect.poll(() => answers.length).toBe(1); // the click did land on A's editor and sent the save
  console.log(`RACE gap-save article=${article.id} b=${b.id} status=${answers[0].status}`);

  expect(answers[0]).toEqual({ status: 403, code: "CSRF_TOKEN_INVALID" });
  const after = await detail(article.id);
  expect(after.revision).toBe(before.revision);
  expect(after.updatedBy.id).toBe(before.updatedBy.id);
  expect(after.translations[0].title).not.toBe(draft);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).not.toContainText(draft);
});

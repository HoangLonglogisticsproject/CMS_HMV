import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";

export const backendDir = resolve(__dirname, "../../backend");

/**
 * E2E_DATABASE_URL, or else the server and credentials of DATABASE_URL in backend/.env with the database
 * hmv_cms_e2e_test: no password is ever written in this repository. Read on use, so pure unit tests need no database.
 */
function e2eDatabaseUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const file = join(backendDir, ".env");
  const dev = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).DATABASE_URL : undefined;
  if (!dev) {
    throw new Error(
      "Set E2E_DATABASE_URL, or DATABASE_URL in backend/.env (its server is reused with the database hmv_cms_e2e_test).",
    );
  }
  const url = new URL(dev);
  url.pathname = "/hmv_cms_e2e_test";
  return url.toString();
}

const apiPort = 4100;
const webPort = 3100;

export const E2E = {
  apiPort,
  webPort,
  api: `http://localhost:${apiPort}`,
  web: `http://localhost:${webPort}`,
  get databaseUrl() {
    return e2eDatabaseUrl();
  },
  mediaDir: join(tmpdir(), "hmv-cms-e2e-media"),
  password: "e2e-only-password-0001",
  users: {
    editor: { email: "editor@e2e.test", name: "Biên Tập Viên E2E", roles: ["EDITOR"] },
    editor2: { email: "editor2@e2e.test", name: "Biên Tập Viên Hai", roles: ["EDITOR"] },
    reviewer: { email: "reviewer@e2e.test", name: "Người Duyệt E2E", roles: ["REVIEWER"] },
    viewer: { email: "viewer@e2e.test", name: "Người Xem E2E", roles: ["VIEWER"] },
    admin: { email: "admin@e2e.test", name: "Quản Trị E2E", roles: ["ADMIN"] },
  },
} as const;

export type E2EUser = keyof typeof E2E.users;

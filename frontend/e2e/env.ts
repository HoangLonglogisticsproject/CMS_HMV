import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const backendDir = resolve(__dirname, "../../backend");

const apiPort = 4100;
const webPort = 3100;

export const E2E = {
  apiPort,
  webPort,
  api: `http://localhost:${apiPort}`,
  web: `http://localhost:${webPort}`,
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? "postgresql://hmv_user:REMOVED_DEV_PASSWORD@localhost:5442/hmv_cms_e2e_test?schema=public",
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

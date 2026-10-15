import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E, backendDir } from "./env";

/** Fresh E2E database: migrate (non-destructive), wipe data, provision one user per role through the backend CLI. */
export default function globalSetup() {
  const database = new URL(E2E.databaseUrl).pathname.slice(1);
  if (!database.endsWith("_test")) throw new Error(`Refusing to run E2E against "${database}" (must end with _test)`);

  const env = { ...process.env, DATABASE_URL: E2E.databaseUrl, HMV_USER_PASSWORD: E2E.password };
  const run = (args: string[]) => execFileSync(process.execPath, args, { cwd: backendDir, env, stdio: "inherit" });

  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: backendDir, env, stdio: "inherit", shell: true });
  run(["dist/scripts/reset-test-data.js"]);
  rmSync(E2E.mediaDir, { recursive: true, force: true });
  for (const user of Object.values(E2E.users)) {
    run(["dist/scripts/create-user.js", "--email", user.email, "--name", user.name, ...user.roles.flatMap((r) => ["--role", r])]);
  }
}

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** The E2E build (distDir `.next-e2e`) rewrites next-env.d.ts; point it back at the normal `.next` output. */
export default function globalTeardown() {
  const file = resolve(__dirname, "../next-env.d.ts");
  const content = readFileSync(file, "utf8");
  if (content.includes(".next-e2e/")) writeFileSync(file, content.replaceAll(".next-e2e/", ".next/"));
}

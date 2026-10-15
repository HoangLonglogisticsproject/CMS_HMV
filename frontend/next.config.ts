import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL is inlined at build time; without it a production bundle would call http://localhost:4000 from
// every user's browser. Fail the build instead (dev keeps the localhost default).
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL must be set for production builds (e.g. https://api.hmvglobal.com)");
}

const nextConfig: NextConfig = {
  // E2E builds into its own directory so it never clobbers a running dev server or the normal build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

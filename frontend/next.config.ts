import type { NextConfig } from "next";

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

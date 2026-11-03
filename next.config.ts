import type { NextConfig } from "next";
import { checkRequiredEnv } from "./lib/required-env";

// On Vercel only, fail the build if a required variable is missing (lib/required-env.ts).
checkRequiredEnv(process.env);

// Server-rendered: Browse reads Supabase per request; the Watchlist and /status go live in the browser.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // AGENTS.md is the owner's; keep `next dev` from writing its own block into it.
  agentRules: false,
  // Market images come only from Polymarket's upload bucket. Cards show them at a fixed size, so each image is
  // optimised at most twice (1x, 2x), well inside the Hobby plan's monthly image allowance.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "polymarket-upload.s3.us-east-2.amazonaws.com", pathname: "/**" }],
  },
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

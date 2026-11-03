// The build-time env check (AGENTS.md → Repo, env and deploy): next.config.ts runs it, and on Vercel only (where
// VERCEL is set) a build missing any variable the app needs fails, naming them all, instead of deploying an app
// that breaks on its first request. Locally and in tests it does nothing.
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

type Env = Record<string, string | undefined>;

export function checkRequiredEnv(env: Env): void {
  if (!env.VERCEL) return;
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length === 0) return;
  throw new Error(
    `Missing environment variables for this Vercel build (${env.VERCEL_ENV ?? "unknown"}): ${missing.join(", ")}. ` +
      "Set them in Vercel → Project → Settings → Environment Variables.",
  );
}

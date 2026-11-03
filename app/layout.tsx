import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthControls } from "@/components/auth-controls";
import { SiteNav, SiteNavLinks } from "@/components/site-nav";
import { THEME_SCRIPT, ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Odds Desk", default: "Odds Desk" },
  description: "Follow Polymarket's busiest Markets in Politics, Sports, Crypto, Finance, Tech, World and Culture and watch the crowd's Chance move live.",
};

// Clerk's components follow the theme: its variables point at the same CSS variables as the app, which the
// `dark` class on <html> switches (Clerk supports var() in modern browsers).
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-accent)",
    colorPrimaryForeground: "var(--color-on-accent)",
    colorBackground: "var(--color-panel)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-dim)",
    colorInput: "var(--color-raised)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-line)",
    colorDanger: "var(--color-down)",
    colorSuccess: "var(--color-up)",
    borderRadius: "0.625rem",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script sets the `dark` class before paint, so <html>'s class differs from the server's on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <ClerkProvider appearance={clerkAppearance}>
          <header className="sticky top-0 z-20 border-b border-line bg-panel/85 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <span className="num grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-on-accent">OD</span>
                Odds Desk
              </Link>
              <div className="flex items-center gap-2">
                {/* The current path is request data: on the sign-in catch-all it must sit in Suspense. */}
                <Suspense fallback={<SiteNavLinks path={null} />}>
                  <SiteNav />
                </Suspense>
                <ThemeToggle />
                <AuthControls />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="mx-auto w-full max-w-6xl border-t border-line px-4 py-6 text-xs text-faint">
            Read-only. Chances are Polymarket midpoints; nobody trades here. Design, Build, Ship · Week 5
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}

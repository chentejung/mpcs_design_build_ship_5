import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Odds Desk", default: "Odds Desk" },
  description: "Follow Polymarket's Politics, Sports and Crypto Markets and watch the crowd's Chance move live.",
};

// Clerk's components in the desk's colours.
const clerkAppearance = {
  variables: {
    colorPrimary: "#c9d3df",
    colorPrimaryForeground: "#0e1116",
    colorBackground: "#151a21",
    colorForeground: "#e7ebf0",
    colorMutedForeground: "#9aa4b2",
    colorInput: "#1c222b",
    colorInputForeground: "#e7ebf0",
    colorBorder: "#2a313c",
    colorDanger: "#f2555a",
    colorSuccess: "#3ecf8e",
    borderRadius: "0.5rem",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ClerkProvider appearance={clerkAppearance}>
          <header className="border-b border-line bg-panel/80">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="num rounded bg-side-a px-1.5 py-0.5 text-xs text-desk">OD</span>
                Odds Desk
              </Link>
              <div className="flex items-center gap-3">
                <SiteNav />
                <AuthControls />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-faint">
            Read-only. Chances are Polymarket midpoints; nobody trades here. Design, Build, Ship · Week 5
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}

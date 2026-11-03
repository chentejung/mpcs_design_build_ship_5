import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Odds Desk", default: "Odds Desk" },
  description: "Follow Polymarket's Politics, Sports and Crypto Markets and watch the crowd's Chance move live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-panel/80">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="num rounded bg-side-a px-1.5 py-0.5 text-xs text-desk">OD</span>
              Odds Desk
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-faint">
          Read-only. Chances are Polymarket midpoints; nobody trades here. Design, Build, Ship · Week 5
        </footer>
      </body>
    </html>
  );
}

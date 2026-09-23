import type { Metadata } from "next";
import "./globals.css";

// Every screen reads live data, so nothing should be prerendered at build time.
// Forcing dynamic here (inherited by all routes) also means the build never
// needs a database connection to generate pages — the deploy builds green even
// before Postgres is attached, then serves live data once it is.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Admin — DPDP",
  description:
    "Admin module of a DPDP-compliant privacy and data protection platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/*
          The Privacy Console shell ships a single light theme (navy sidebar,
          white canvas) — there is no dark mode or theme switcher. data-theme
          is pinned to "light" so the prefers-color-scheme dark rules, which are
          guarded by :not([data-theme="light"]), never apply.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

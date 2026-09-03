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
    <html lang="en">
      <head>
        {/*
          Applies the stored theme before first paint. Doing this in a React
          effect instead would render light, then correct on hydration — a
          visible flash on every navigation, which defeats the point of a
          toggle meant for flipping back and forth.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('privacy-admin.theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

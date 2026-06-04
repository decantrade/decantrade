import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";
import { getConfig } from "@/lib/wagmi";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://decantrade.com"),
  title: "Decant | Permissionless Perp Markets on Base",
  description:
    "Launch a leveraged perpetual market for any Base token in 60 seconds. No listing fees, no governance, fully on-chain. Coin-margined perps powered by Base.",
  keywords: [
    "Decant",
    "perpetual futures",
    "Base",
    "DEX",
    "permissionless",
    "DeFi",
    "perps",
  ],
  openGraph: {
    title: "Decant | Permissionless Perp Markets on Base",
    description:
      "Launch a leveraged perpetual market for any Base token in 60 seconds. Fully on-chain, permissionless.",
    url: "https://decantrade.com",
    siteName: "Decant",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Decant | Permissionless Perp Markets on Base",
    description:
      "Launch a leveraged perpetual market for any Base token in 60 seconds.",
    site: "@decanttrade",
    creator: "@decanttrade",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://decantrade.com/#organization",
      name: "Decant",
      url: "https://decantrade.com",
      logo: "https://decantrade.com/brand/decant-mark.png",
      sameAs: [
        "https://x.com/decanttrade",
        "https://github.com/decent-trade/decantrade",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://decantrade.com/#website",
      name: "Decant",
      url: "https://decantrade.com",
      publisher: { "@id": "https://decantrade.com/#organization" },
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = cookieToInitialState(
    getConfig(),
    (await headers()).get("cookie"),
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}

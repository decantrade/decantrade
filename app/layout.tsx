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
  title: "Decant | On-chain Perp Futures on Base",
  description:
    "Trade ETH, BTC and SOL perpetual futures on Base mainnet. Fully on-chain, USDC-margined, with a vAMM and insurance fund on every market. Guarded beta — real funds, gated, capped.",
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
    title: "Decant | On-chain Perp Futures on Base",
    description:
      "Trade ETH, BTC and SOL perps on Base mainnet. Fully on-chain, USDC-margined. Guarded beta.",
    url: "https://decantrade.com",
    siteName: "Decant",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Decant | On-chain Perp Futures on Base",
    description:
      "Trade ETH, BTC and SOL perps on Base mainnet. Guarded beta — real funds, gated, capped.",
    site: "@_decantrade",
    creator: "@_decantrade",
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
        "https://x.com/_decantrade",
        "https://github.com/decantrade/decantrade",
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

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
  title: "Decant Protocol | Index-Priced Perps on Solana",
  description:
    "Trade SOL-PERP index-priced perpetual futures on Decant Protocol — on Solana, USDC-margined, fully on-chain with an insurance fund. Guarded launch.",
  keywords: [
    "Decant",
    "Decant Protocol",
    "perpetual futures",
    "Solana",
    "DEX",
    "DeFi",
    "perps",
  ],
  openGraph: {
    title: "Decant Protocol | Index-Priced Perps on Solana",
    description:
      "Trade SOL-PERP index-priced perpetual futures on Solana. USDC-margined, fully on-chain. Guarded launch.",
    url: "https://decantrade.com",
    siteName: "Decant Protocol",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Decant Protocol | Index-Priced Perps on Solana",
    description:
      "Trade SOL-PERP index-priced perpetual futures on Solana. USDC-margined, guarded launch.",
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

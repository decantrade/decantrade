import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
    images: [
      {
        url: "/brand/decant-og.png",
        width: 1200,
        height: 630,
        alt: "Decant Protocol — index-priced perps on Solana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Decant Protocol | Index-Priced Perps on Solana",
    description:
      "Trade SOL-PERP index-priced perpetual futures on Solana. USDC-margined, guarded launch.",
    site: "@_decantrade",
    creator: "@_decantrade",
    images: ["/brand/decant-og.png"],
  },
  other: {
    "ory-verify": "orynth-68e921ec4bdd415d8cef5b3e32e6de3e",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

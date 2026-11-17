import type { Metadata } from "next";
import localFont from "next/font/local";
import { PwaRegistration } from "@/components/pwa-registration";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "solGain | Solana Token Terminal", template: "%s | solGain" },
  description: "A non-custodial Solana token screener with portfolio, watchlist, and swap tools.",
  openGraph: { title: "solGain", description: "Non-custodial Solana token terminal.", type: "website" },
  applicationName: "solGain",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "solGain" },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegistration />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

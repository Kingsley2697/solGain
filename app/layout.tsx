import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { PwaRegistration } from "@/components/pwa-registration";
import { WalletProvider } from "@/components/wallet-provider";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dense",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "SolGain | Solana Token Terminal", template: "%s | SolGain" },
  description: "A non-custodial Solana token screener with portfolio, watchlist, and swap tools.",
  openGraph: { title: "SolGain", description: "Non-custodial Solana token terminal.", type: "website" },
  applicationName: "SolGain",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SolGain" },
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
        className={`${spaceGrotesk.variable} ${plusJakartaSans.variable} ${geist.variable} ${jetBrainsMono.variable} font-sans antialiased`}
      >
        <PwaRegistration />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <main className="token-loading"><p className="eyebrow">SOLGAIN</p><strong>Privacy</strong><span>solGain reads the public wallet address that you choose to connect so it can display balances, saved browser data, and transaction context. It does not receive private keys or seed phrases.</span><span>Watchlists and tracked cost basis are stored in your browser unless you explicitly configure a supported sync service. Third-party data and swap providers receive the requests needed to provide their services under their own policies.</span><Link href="/">Back to markets</Link></main>;
}

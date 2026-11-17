import Link from "next/link";

export const metadata = { title: "Terms and risk disclosure" };

export default function TermsPage() {
  return <main className="token-loading"><p className="eyebrow">SOLGAIN</p><strong>Terms and risk disclosure</strong><span>solGain is a non-custodial interface: it never takes custody of your wallet or assets. Token prices, liquidity, holder data, safety signals, and routing quotes can be delayed, incomplete, or wrong. Digital-asset trading is high risk and may result in total loss.</span><span>Use the app only where permitted by law. Verify every token address and transaction in your wallet before signing. Safety signals are not audits, investment advice, or a recommendation to trade.</span><Link href="/">Back to markets</Link></main>;
}

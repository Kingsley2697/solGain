import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <div className="offline-card">
        <span className="offline-mark" aria-hidden="true">S</span>
        <p>solGain is offline</p>
        <h1>Your market terminal will be back when you reconnect.</h1>
        <span>Live prices, wallet data, and swaps need an internet connection. Your app is still installed and ready to reopen.</span>
        <Link href="/">Try again</Link>
      </div>
    </main>
  );
}

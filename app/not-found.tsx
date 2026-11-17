import Link from "next/link";

export default function NotFound() {
  return <main className="token-loading"><strong>Page not found</strong><span>The page or token address does not exist.</span><Link href="/">Back to markets</Link></main>;
}

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Close Looking Demo",
  description: "Vision-led art retrieval and reviewable conversation demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
          <div className="container flex items-center justify-between py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                Demo
              </span>
              <span className="text-lg font-semibold">Close Looking</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/">Home</Link>
              <Link href="/submit">Start Thread</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

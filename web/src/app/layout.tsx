import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lecture",
  description: "Web UI 主导的学习路径站点（PDF / 链接 / 归档）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-dvh bg-white text-zinc-950 dark:bg-black dark:text-zinc-50">
          <header className="sticky top-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <Link href="/" className="font-semibold tracking-tight">
                Lecture
              </Link>
              <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300">
                <Link href="/" className="hover:text-zinc-950 dark:hover:text-white">
                  Tracks
                </Link>
                <Link
                  href="/getting-started"
                  className="hover:text-zinc-950 dark:hover:text-white"
                >
                  使用说明
                </Link>
                <Link
                  href="/maintainer"
                  className="hover:text-zinc-950 dark:hover:text-white"
                >
                  维护者
                </Link>
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>

          <footer className="border-t border-black/10 py-8 text-center text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <div className="mx-auto max-w-6xl px-4">
              Lecture site · Deployed on k3s · Assets served via MinIO gateway
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

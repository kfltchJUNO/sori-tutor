import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sori-Tutor | AI Korean Pronunciation Coach · 소리튜터",
  description:
    "AI-powered Korean pronunciation coaching. Speak Korean like a native with real-time phoneme-level feedback. TOPIK I~II curriculum. 소리튜터 — AI 한국어 발음 교정 서비스.",
  keywords: [
    "Korean pronunciation", "한국어 발음", "TOPIK", "Korean language learning",
    "AI Korean tutor", "소리튜터", "한국어 회화", "발음 교정",
  ],
  openGraph: {
    title: "Sori-Tutor | AI Korean Pronunciation Coach",
    description: "Speak Korean like a native. AI analyzes your pronunciation in real time.",
    url: "https://sori-tutor.vercel.app",
    siteName: "Sori-Tutor",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google AdSense — <head>에 직접 삽입 (소유권 확인 + 광고) */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4585319125929329"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
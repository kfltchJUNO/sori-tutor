import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 🔥 [중요] vm이 아니라 next/script에서 가져와야 합니다.
import Script from "next/script"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "🗣️ Sori-Tutor", 
  description: "내 손 안의 한국어 발음 선생님, 소리 튜터(Sori-Tutor)", 
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 🔥 [수정] 
          1. 일반 <script> 태그는 삭제했습니다. (Next.js Script와 중복됨)
          2. Script 컴포넌트를 사용하여 최적화합니다.
        */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4585319125929329"
          crossOrigin="anonymous"
          strategy="afterInteractive" 
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
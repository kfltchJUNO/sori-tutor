import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "🗣️ Sori-Tutor", // 브라우저 탭에 보일 이름
  description: "내 손 안의 한국어 발음 선생님, 소리 튜터(Sori-Tutor)", // 링크 공유 시 보일 설명
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
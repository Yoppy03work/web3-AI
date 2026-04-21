import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "yoppy | AIと一緒に学び、作り、壊す人",
  description:
    "千葉工業大学 情報変革科学部 — セキュリティーとAIに関心を持つ yoppy の自己紹介ページ",
  openGraph: {
    title: "yoppy | AIと一緒に学び、作り、壊す人",
    description:
      "千葉工業大学 情報変革科学部 — セキュリティーとAIに関心を持つ yoppy の自己紹介ページ",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

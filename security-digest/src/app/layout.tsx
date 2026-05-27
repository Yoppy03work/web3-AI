import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Morning Digest",
  description:
    "海外セキュリティニュースをタグ別に絞り込み、LLM で日本語要約して通学5分で読むダイジェスト。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

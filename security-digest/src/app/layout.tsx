import type { Metadata } from "next";
import "./globals.css";
import FontSizeControl from "@/components/FontSizeControl";

export const metadata: Metadata = {
  title: "Security Morning Digest",
  description:
    "海外セキュリティニュースをタグ別に絞り込み、LLM で日本語要約して通学5分で読むダイジェスト。",
};

// Apply the saved font size before first paint (no flash of default size).
const FONT_INIT = `(function(){try{var f=localStorage.getItem('fontSize');if(f==='sm'||f==='md'||f==='lg'||f==='xl'){document.documentElement.dataset.font=f;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT }} />
      </head>
      <body>
        <FontSizeControl />
        {children}
      </body>
    </html>
  );
}

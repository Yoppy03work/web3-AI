import type { Metadata } from "next";
import "./globals.css";
import FontSizeControl from "@/components/FontSizeControl";
import ThemeControl from "@/components/ThemeControl";

export const metadata: Metadata = {
  title: "Security Morning Digest",
  description:
    "海外セキュリティニュースをタグ別に絞り込み、LLM で日本語要約して通学5分で読むダイジェスト。",
};

// Apply the saved font size + theme before first paint (no flash of default).
const DISPLAY_INIT = `(function(){try{var d=document.documentElement;var f=localStorage.getItem('fontSize');if(f==='sm'||f==='md'||f==='lg'||f==='xl'){d.dataset.font=f;}var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){d.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_INIT }} />
      </head>
      <body>
        <div className="displayctl">
          <ThemeControl />
          <FontSizeControl />
        </div>
        {children}
      </body>
    </html>
  );
}

import Link from "next/link";
import { listBookmarkedArticles } from "@/lib/db";
import BookmarkList from "@/components/BookmarkList";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const items = await listBookmarkedArticles(200).catch(() => []);

  return (
    <main className="shell">
      <nav className="topnav">
        <Link href="/" className="back">← フィードに戻る</Link>
        <Link href="/archive" className="back">アーカイブ</Link>
      </nav>

      <header className="hdr">
        <h1 className="title">
          <span className="prompt">$</span> bookmarks
        </h1>
        <p className="dim" style={{ marginTop: "6px" }}>
          ☆ で保存した記事。新しく保存した順。
        </p>
      </header>

      <BookmarkList items={items} />

      <footer className="ftr">
        <p className="dim">
          ブックマークは Turso に保存。未接続のローカル環境では当セッション内のみ保持。
        </p>
      </footer>
    </main>
  );
}

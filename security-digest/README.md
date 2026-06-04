# Security Morning Digest

海外セキュリティニュースを 5 媒体から集約し、興味タグで絞り込み、Claude で
日本語要約 +「なぜ重要か」+ **本文の日本語訳** を表示する個人用ダイジェスト。
通学の 5 分で世界の脅威動向を眺める用途。

- スタック: **Next.js 16 (App Router, Turbopack) / React 19 / TypeScript**
- 実行時依存は `next` / `react` / `react-dom` のみ。RSS/Atom パーサ、Upstash
  REST クライアント、本文抽出はすべて自前実装（依存ゼロ）。
- スタイルは素の CSS、Tailwind なし。
- 履歴の永続化は **Upstash Redis（REST 経由、SDK 不使用）**。未接続でも
  ローカル開発はインメモリで動く。

## ページ

- `/` — 最新ダイジェスト。タグでクライアントサイドフィルタ
- `/article/[id]` — 記事詳細。要約 / なぜ重要 / **本文の日本語訳**（失敗時は原文）
  / 原文リンク
- `/archive` — 日付ごとの過去スナップショット（最大 90 日）
- `/api/digest` — JSON API（`?refresh=1` で強制再生成）

## ローカルで動かす

```bash
cd security-digest
npm install
cp .env.example .env.local      # 鍵が無くても起動する
npm run dev                     # http://localhost:3000
# または
npm run build && npm start
```

LLM キー未設定でも、Upstash 未接続でも、外部フィード不通でも HTTP 200 で
起動するように作っている。

- `ANTHROPIC_API_KEY` 未設定 → 各記事は **英語の抜粋** がそのまま `summaryJa` に入る
- Upstash 未接続 → アーカイブはインメモリのみ（プロセス再起動で消える）
- 取得失敗ソースは画面上部のバナーに名前が出る

## 環境変数

| 名前 | 用途 | 既定値 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Messages API キー。要約 + 本文翻訳の両方に使用 | （空） |
| `LLM_MODEL` | Claude モデル ID（日付付き推奨） | `claude-haiku-4-5-20251001` |
| `DIGEST_MAX_ITEMS` | 1 回の更新で要約する記事数 | `12` |
| `DIGEST_TTL_MINUTES` | インメモリキャッシュの TTL（分） | `360` |
| `REFRESH_TOKEN` | `/api/digest?refresh=1` の保護トークン。空ならノーガード | （空） |
| `UPSTASH_REDIS_REST_URL` | Upstash REST エンドポイント URL | （空） |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST トークン | （空） |

## Upstash Redis のつなぎ方（履歴の永続化）

1. https://console.upstash.com → ログイン → **Create Database**
2. Type **Regional** / Eviction **Disabled** を選んで作成
3. 詳細画面の **REST API** タブから 2 つコピー：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Vercel の Environment Variables（Production + Preview）に貼り付け → Redeploy

未設定の場合はインメモリにフォールバックするので **動作は変わらない**。
ただし `/archive` は当日分しか出ない。

### 何が KV に入るのか

- `digest:latest` — 最新スナップショット（JSON）
- `digest:YYYY-MM-DD` — その日のスナップショット
- `digest:dates` — 日付一覧（sorted set、新しい順に並べる）
- `article:<id>` — 1 記事ごとの記録。要約 / なぜ重要 / 本文 / 本文の日本語訳

## Vercel へデプロイ

1. このリポジトリを GitHub に push
2. Vercel で新規プロジェクト作成 → 該当リポジトリを選択
3. **重要**: Project Settings → General → **Root Directory** に `security-digest` を指定
   （親リポジトリ直下に別の Next.js プロジェクトが居る構成のため。これを忘れると親側がビルドされる）
4. Environment Variables：少なくとも `ANTHROPIC_API_KEY` と Upstash の 2 つを入れる
5. Deploy

Cron は `vercel.json` に同梱（UTC 22:00 = JST 07:00 に `/api/digest?refresh=1` を叩く）。
`REFRESH_TOKEN` を有効にする場合は `vercel.json` の `path` も `?refresh=1&token=...` に書き換える。

## 制約 / 次の一手

このプロトの割り切りと、伸ばすときの方向性。

- **本文抽出は best-effort**: シンプルな regex ベースで `<article>` / `<main>` /
  `<p>` だけ拾っている。サイトによっては抜けが多い。Mozilla Readability 移植を
  入れる手があるが、依存ゼロ縛りを緩めることになる。
- **タグ付けはキーワード一致**: 部分一致だけだと取りこぼし・誤爆がある。
  Claude 1 リクエスト内でタグも返させると精度が上がる（要約バッチに `tags` を
  追加するだけ）。
- **読書ログが無い**: 「読んだ」「あとで読む」フラグや Notion / Obsidian への
  取り込みは未実装。`article:<id>` に `readAt`・`saved` を足して localStorage と
  両側書きするのが軽い。
- **通知が無い**: 朝のダイジェスト完了を Webhook / メール / Discord / Slack に
  飛ばす経路は無い。Cron 後の `/api/digest?refresh=1` レスポンスを次の段で
  Webhook に流すだけで動く。
- **全文検索が無い**: 過去ダイジェストが溜まると必要。`article:<id>` を
  Upstash Search や Algolia に二重書きするのが楽。

## 開発メモ（このバージョンの Next.js の癖）

- `next build` は Turbopack 既定で、lint は走らない。型は走る。
- `cacheComponents` は **無効のまま**。`unstable_instant` も使わない（単一ルート用途で不要）。
- 親フォルダの `postcss.config` を拾うのを防ぐため、空の `postcss.config.mjs` を直下に置いてある。
- `tsconfig.json` の `jsx` は `"react-jsx"` で固定。
- `turbopack.root` を `path.resolve(".")` でこのフォルダにピン留めしてある（同上の理由）。
- ページ / API ルートとも `export const dynamic = "force-dynamic"`。

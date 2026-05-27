# Security Morning Digest

海外セキュリティニュースを 5 媒体から集約し、興味タグで絞り込み、Claude で日本語要約して
「なぜ重要か」を一言添えて表示する個人用ダイジェスト。通学の 5 分で世界の脅威動向を眺める用途。

- スタック: **Next.js 16 (App Router, Turbopack) / React 19 / TypeScript**
- 実行時依存は `next` / `react` / `react-dom` のみ。RSS/Atom パーサは自前実装。
- スタイルは素の CSS、Tailwind なし。

## ローカルで動かす

```bash
cd security-digest
npm install
cp .env.example .env.local        # 鍵が無くても起動する。鍵を入れると日本語要約 ON
npm run dev                       # http://localhost:3000
# または
npm run build && npm start
```

LLM キー未設定でも、ネット不通でも HTTP 200 で起動するように作っている。
- キー未設定 → 各記事は **英語の抜粋** がそのまま `summaryJa` に入る（「なぜ重要」は空）。
- 取得失敗ソースは画面上部のバナーに名前が出る。

API:
- `GET /api/digest` → 現在のダイジェスト JSON（`cache-control: no-store`）。
- `GET /api/digest?refresh=1` → 強制再生成。`REFRESH_TOKEN` を設定している場合は `&token=...` も必須。

## 環境変数

| 名前 | 用途 | 既定値 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Messages API キー。未設定なら英語抜粋にフォールバック | （空） |
| `LLM_MODEL` | 要約に使う Claude のモデル ID | `claude-haiku-4-5` |
| `DIGEST_MAX_ITEMS` | 1 回の更新で要約する記事数（取得は全件、上位 N を要約） | `12` |
| `DIGEST_TTL_MINUTES` | インメモリキャッシュの TTL（分） | `360` |
| `REFRESH_TOKEN` | `/api/digest?refresh=1` の保護用トークン。空ならノーガード | （空） |

## Vercel へデプロイ

1. このリポジトリを GitHub に push。
2. Vercel で新規プロジェクト作成 → 該当リポジトリを選択。
3. **重要**: Project Settings → General → **Root Directory** に `security-digest` を指定。
   （親リポジトリ直下に別の Next.js プロジェクトが居る構成のため。これを忘れると親側がビルドされる。）
4. Environment Variables に上の表の値を入れる（最低限 `ANTHROPIC_API_KEY` は本番に）。
5. Deploy。

Cron は `vercel.json` に同梱（UTC 22:00 = JST 07:00 に `/api/digest?refresh=1` を叩く）。
`REFRESH_TOKEN` を有効にする場合は `vercel.json` の `path` を `/api/digest?refresh=1&token=...` に
書き換えるか、Vercel の Cron が認証ヘッダを付ける別の仕組みに切り替える。

## 制約 / 次の一手

このプロトの割り切りと、伸ばすときの方向性。

- **キャッシュがメモリ揮発**: サーバーレスでは Lambda インスタンスごとに別キャッシュ。
  ヒット率を上げたい・コストを下げたいなら **Vercel KV / Upstash / Redis** に永続化する。
  `src/lib/digest.ts` の `cache` オブジェクトを差し替える。
- **タグ付けはキーワード一致**: シンプルな部分一致だけだと取りこぼし・誤爆がある。
  数件以内のコストで **LLM にタグ分類も任せる** と精度が上がる。
  （現状の要約バッチに `"tags"` フィールドを足して同じ 1 リクエストで済ませる手も）
- **読書ログを残せない**: 「読んだ」「あとで読む」フラグや Obsidian / Notion への取り込みは未実装。
  Notion DB に POST する Server Action と、お気に入りを表すローカル `localStorage` 程度から始めると軽い。
- **通知が無い**: Webhook / メール / LINE / Slack で「朝のダイジェストが出来ました」を投げる経路を足す。
  Cron 後の `/api/digest?refresh=1` のレスポンスを Webhook に流すだけでもとりあえず動く。
- **全文検索が無い**: 過去ダイジェストを蓄積した時点で必要になる。永続ストレージ導入とセットで考える。

## 開発メモ（このバージョンの Next.js の癖）

- `next build` は Turbopack 既定で、lint は走らない。型は走る。
- `cacheComponents` は **無効のまま**。`unstable_instant` も使わない（単一ルートなので不要）。
- 親フォルダの `postcss.config` を拾うのを防ぐため、空の `postcss.config.mjs` をプロジェクト直下に置いてある。
- `tsconfig.json` の `jsx` は `"react-jsx"` で固定。
- ページ / API ルートともに `export const dynamic = "force-dynamic"`。

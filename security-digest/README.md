# Security Morning Digest

海外セキュリティの **ニュース・研究ブログ・論文** を 9 媒体から集約し、興味タグで
絞り込み、Claude で日本語要約 +「なぜ重要か」+ **本文の日本語訳** を表示する個人用
ダイジェスト。通学の 5 分で世界の脅威動向を眺める用途。

- スタック: **Next.js 16 (App Router, Turbopack) / React 19 / TypeScript**
- 実行時依存は `next` / `react` / `react-dom` のみ。RSS/Atom パーサ、Turso(libSQL)
  HTTP クライアント、本文抽出はすべて自前実装（依存ゼロ）。
- スタイルは素の CSS、Tailwind なし。
- 履歴の永続化は **Turso（libSQL ＝ SQLite 互換のクラウド DB）**。REST 経由なので
  SDK 不要。未接続でもローカル開発はインメモリで動く。

## ページ

- `/` — 最新ダイジェスト。タグでクライアントサイドフィルタ。媒体に 論文/研究 バッジ。記事中の **CVE は CVSS スコア付きバッジ**（深刻度で色分け）。**同じ事件を複数媒体が報じていれば「🔗 続報」**でまとめ表示。タグ/種別/ソースで絞り込み・未読のみ表示・既読は淡色化。各カードに ☆ ブックマーク。右上で文字サイズ/テーマ(ライト/ダーク)切替
- `/article/[id]` — 記事詳細。要約 / なぜ重要 / **本文の日本語訳**（失敗時は原文）/ 原文リンク / ☆ 保存
- `/bookmarks` — ☆ で保存した記事一覧（新しい順）
- `/cve` — **CVE特集**：CISA KEV（実際に悪用中の脆弱性、古いものも含む）を新着順に。ランサム悪用フラグ・CVSS・本ダイジェストの関連記事と突合
- `/weekly` — **週報**：毎週日曜 19:00 JST の夕刊と同時に、その週（月〜日）の総括を LLM 生成（Slack にも配信、最大12週分）
- `/search?q=` — タイトル・要約・本文（日本語訳）を横断検索
- `/archive` — 過去スナップショット（**朝刊/夕刊を個別に**保存、最大 90 版）
- `/api/digest` — JSON API（`?refresh=1` で強制再生成）
- `/api/bookmark` — ブックマークのトグル（`POST { id, on }`）

トップには **今日の3行 TL;DR** に加えて **📋 今日のレポート**（概況 / 注目の脅威 /
脆弱性CVE / AI動向 / その他の話題 のラベル付きまとめ）を表示（LLM 有効時）。

> **ブックマークは Turso 接続が前提**。個人利用前提でログインは無し（書き込み認証なし）。
> 未接続のローカルだとルートごとにメモリが分かれて保存一覧に出ないので、`/bookmarks`
> を試すなら Turso を繋ぐこと。

## ソース

`src/lib/sources.ts` の `SOURCES` 配列で増減できる。各ソースは `kind`（`news` /
`research` / `paper`）を持ち、UI のバッジと将来のフィルタに使う。

| 種別 | 媒体 |
| --- | --- |
| news | The Hacker News / BleepingComputer / Krebs on Security / Dark Reading / Schneier on Security / Security NEXT(日本語) |
| research | Google Project Zero / PortSwigger Research |
| paper | arXiv cs.CR / IACR ePrint |
| ai | Simon Willison / The Decoder（AIの最新動向。ついで枠） |

> Black Hat は公開 RSS を出していない（ボットを 403 で弾く）ため、同等以上の研究が
> 読める Project Zero / PortSwigger を採用。`sources.ts` 末尾に、検証済みの追加候補
> （Cisco Talos / Unit 42 / SANS ISC / Google Security Blog）をコメントで置いてある。
> コメントを外せば即有効。

論文系は 1 日数十本入るので、フロントが特定フィードで埋まらないよう、表示・要約する
上位 N 件は **1 ソースあたり最大 4 件** に制限している（`PER_SOURCE_CAP`）。

**日本語ソース**（`lang: "ja"`、例: Security NEXT）は RSS 抜粋が既に日本語なので、
**LLM 要約・翻訳をスキップ**して抜粋をそのまま要約に使い、本文はクロール表示する
（AI コスト不要・即時）。タグ付け / CVE 抽出 / 続報クラスタは通常どおり効く。

## ローカルで動かす

```bash
cd security-digest
npm install
cp .env.example .env.local      # 鍵も DB も無くて起動する
npm run dev                     # http://localhost:3000
# または
npm run build && npm start
```

`ANTHROPIC_API_KEY` 未設定でも、Turso 未接続でも、外部フィード不通でも HTTP 200 で
起動するように作っている。

- `ANTHROPIC_API_KEY` 未設定 → 各記事は **英語の抜粋** がそのまま `summaryJa` に入る
- Turso 未接続 → アーカイブはインメモリのみ（プロセス再起動で消える）
- 取得失敗ソースは画面上部のバナーに名前が出る

## 環境変数

| 名前 | 用途 | 既定値 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Messages API キー。要約 + 本文翻訳の両方に使用 | （空） |
| `LLM_MODEL` | Claude モデル ID（日付付き推奨） | `claude-haiku-4-5-20251001` |
| `NVD_API_KEY` | CVE/CVSS 取得用の NVD APIキー（任意。無くても動く） | （空） |
| `NVD_MAX_LOOKUPS` | 1回の更新で NVD に問い合わせる新規CVE数の上限 | `5` |
| `DIGEST_MAX_ITEMS` | 1 回の更新で要約する記事数 | `18` |
| `DIGEST_TTL_MINUTES` | インメモリキャッシュの TTL（分） | `360` |
| `REFRESH_TOKEN` | 手動 `/api/digest?refresh=1` に必要なトークン | （空） |
| `CRON_SECRET` | 設定すると Vercel Cron が `Authorization: Bearer` で自動認証。本番推奨。どちらか設定時、未認証の refresh は 401 | （空） |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook。設定すると毎朝の更新時に要約を投稿 | （空） |
| `SITE_URL` | Slack メッセージ内リンクの基準 URL（Vercel では自動検出） | （空） |
| `WATCH_KEYWORDS` | キーワード購読アラート。カンマ区切り。一致した新着記事を Slack 通知（記事単位で重複排除） | （空） |
| `SLACK_MIN_SEVERITY` | 重大のみ通知。`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`。該当なしの回は投稿しない | （空＝毎回通知） |
| `TURSO_DATABASE_URL` | Turso DB の URL（`libsql://` でも可、自動で https に変換） | （空） |
| `TURSO_AUTH_TOKEN` | Turso のアクセストークン | （空） |

## Turso のつなぎ方（履歴の永続化）

1. https://app.turso.tech → ログイン → **Create Database**（リージョンは近い所を）
2. データベースを開き **Connect** で URL を、**Create Token** でトークンを取得
3. Vercel の Environment Variables（Production + Preview）に貼り付け：
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
4. Redeploy。次回の生成（cron もしくは `/api/digest?refresh=1`）からテーブルが
   自動作成され、履歴が溜まりはじめる。

未設定の場合はインメモリにフォールバックするので **動作は変わらない**。
ただし `/archive` は当日分しか出ない。

### スキーマ

初回アクセス時に `CREATE TABLE IF NOT EXISTS` で自動作成される。

```sql
-- 1 記事 = 1 行。本文 / 翻訳は詳細ページ初回訪問で埋まる（再取得しても消えない）
CREATE TABLE articles (
  id TEXT PRIMARY KEY,        -- SHA-256(正規化リンク) 先頭 10hex
  source TEXT, kind TEXT,     -- kind: news | research | paper
  title TEXT, link TEXT, excerpt TEXT,
  published_at TEXT, digest_date TEXT,
  tags TEXT,                  -- JSON 配列
  summary_ja TEXT, why_ja TEXT,
  body TEXT, body_ja TEXT,
  llm INTEGER, first_seen TEXT
);

-- 1 日 = 1 スナップショット（Digest の JSON 丸ごと）
CREATE TABLE digests (date TEXT PRIMARY KEY, generated_at TEXT, payload TEXT);
```

### SQL で過去を掘る例

Turso のダッシュボード（または `turso db shell <db>`）で:

```sql
-- 論文だけ、新しい順に 20 件
SELECT digest_date, source, title FROM articles
WHERE kind='paper' ORDER BY published_at DESC LIMIT 20;

-- 「ランサムウェア」タグが付いた記事を数える
SELECT count(*) FROM articles WHERE tags LIKE '%ランサムウェア%';

-- 日別の記事数
SELECT digest_date, count(*) FROM articles GROUP BY digest_date ORDER BY 1 DESC;
```

## Vercel へデプロイ

1. このリポジトリを GitHub に push
2. Vercel で新規プロジェクト作成 → 該当リポジトリを選択
3. **重要**: Project Settings → General → **Root Directory** に `security-digest` を指定
   （親リポジトリ直下に別の Next.js プロジェクトが居る構成のため。これを忘れると親側がビルドされる）
4. Environment Variables：少なくとも `ANTHROPIC_API_KEY` と Turso の 2 つを入れる
5. Deploy

Cron は `vercel.json` に **1日2本**（UTC 22:00 = **JST 07:00 朝刊** / UTC 10:00 = **JST 19:00 夕刊**）。
各更新で記事を取り直し、**今日の3行 TL;DR**（LLM）と朝刊/夕刊ラベルを付与してトップ＋Slack に出す。
（Vercel Hobby は cron 2本・各1日1回まで。本構成はその範囲内）
本番では `CRON_SECRET` を設定すれば、cron は `Authorization: Bearer` で自動認証され、`?refresh=1` の無認証実行を 401 で塞げる。

### Slack 通知

1. https://api.slack.com/messaging/webhooks で Incoming Webhook を作成 → 通知先チャンネルを選ぶ → Webhook URL を取得
2. Vercel の環境変数に `SLACK_WEBHOOK_URL` を追加 → Redeploy
3. 毎朝の cron（`?refresh=1`）が発火するたびに、上位6件の要約＋「なぜ重要」＋記事リンクがそのチャンネルに届く

手動で試すには `/api/digest?refresh=1`。通知を出したくない検証時は `/api/digest?refresh=1&notify=0`。

### KEV 速報（悪用が確認された脆弱性の Slack アラート）

毎回の更新時に CISA KEV カタログを前回と差分比較し、**新規追加された CVE**（= 実悪用が
確認されたもの）だけを Slack に即時通知する。🦠 ランサム悪用フラグ付きは先頭で強調。

- **初回実行はサイレント**：カタログ既存の ~1600 件を「既読」として登録するだけで通知しない
  （通知爆発の防止）。2回目以降の cron から差分通知が始まる
- 既読状態は Turso の `kev_seen` テーブルに保存。`&notify=0` で抑制可能
- `SLACK_MIN_SEVERITY` は適用しない（KEV 入り＝悪用確認済みのため全件通知する価値がある）

### 週報

毎週**日曜 19:00 JST の夕刊 cron に相乗り**して、その週（月〜日）に収集した記事から
総括レポート（概況 / 主要インシデント / 悪用された脆弱性 / AI動向 / 来週への注目）を
1 LLM コールで生成。`/weekly` に掲載し Slack にも配信。週単位で冪等（同じ週は再生成しない）。
手動テストは `/api/digest?refresh=1&weekly=1`（認証は refresh と同じ）。
Vercel Hobby の cron 上限（2本）を消費しないための相乗り設計。

> **Hobby プランの注意**: 詳細ページ初回は 本文 fetch + 翻訳で 10 秒近くかかることが
> ある（関数タイムアウトは Hobby=10s）。タイムアウトしても次回アクセスで再試行され、
> 本文だけ取れた場合は英語本文を表示する。確実にしたいなら Pro（60s）。

## 制約 / 次の一手

- **本文抽出は best-effort**: 関連記事/コメント/著者欄の末尾セクションを切り落とし、
  記事本文コンテナ（id/class）の中で最も段落量の多いものを選び、定型文（購読/Cookie/
  ©など）を除外。取れない場合は og:description にフォールバック。JS 描画サイトは
  meta 説明のみになることがある（精度を上げるなら Readability 移植だが依存が増える）。
- **タグ付けはキーワード一致**: 取りこぼし・誤爆あり。Claude の要約 1 リクエスト内で
  タグも返させると精度が上がる（バッチに `tags` を追加するだけ）。
- **重要度スコア**: 要約バッチで深刻度(1〜5)も返させ、並べ替え／通知の絞り込みに使う。
- **Notion / Obsidian 連携**: ブックマークした記事を Notion DB や Markdown に書き出す。
- **自分用 RSS / メール**: `/feed.xml` を生成して任意のリーダーで購読。

実装済みの一手: ✅ Slack 通知 / ✅ ブックマーク / ✅ 全文検索（FTS5・trigram）。

## 開発メモ（このバージョンの Next.js の癖）

- `next build` は Turbopack 既定で、lint は走らない。型は走る。
- `cacheComponents` は **無効のまま**。`unstable_instant` も使わない（単一ルート用途で不要）。
- 親フォルダの `postcss.config` を拾うのを防ぐため、空の `postcss.config.mjs` を直下に置いてある。
- `tsconfig.json` の `jsx` は `"react-jsx"` で固定。
- `turbopack.root` を `path.resolve(".")` でこのフォルダにピン留め。
- ページ / API ルートとも `export const dynamic = "force-dynamic"`。

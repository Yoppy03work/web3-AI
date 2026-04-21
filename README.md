# yoppy さんの自己紹介ランディングページ

千葉工業大学「web3/AI概論」課題用の自己紹介LPです。
「静かな夜の星空」をテーマに、Next.js と Tailwind CSS を使用して作成されています。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- framer-motion (スクロールアニメーション)
- Canvas API (星空背景)

## ローカル開発手順

1. 依存関係のインストール
   ```bash
   npm install
   ```

2. 開発サーバーの起動
   ```bash
   npm run dev
   ```

3. ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認してください。

## デプロイ方法

このプロジェクトはそのまま Vercel にデプロイ可能です。

1. このリポジトリを GitHub に push します
2. Vercel のダッシュボードから `Add New...` > `Project` を選択
3. 当該リポジトリを Import します
4. フレームワークは自動的に `Next.js` と認識されるため、そのまま `Deploy` ボタンを押すだけで公開できます。
   変更を `main` ブランチに push するたびに、自動でデプロイが実行されます。

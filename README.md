# 柳川文献スクリーニングツール

柳川レビュー論文プロジェクト用の、複数人向け文献スクリーニングツールです。
Google Scholarから収集した1,185件の文献リストを、評価者ごとに「含める／要確認／除外」で判定し、コメントを残せます。判定が割れた文献は自動的に「対立」として検出されます。

## 構成（2026-07-24 更新）

Cloudflareは現在PagesをWorkers（静的アセット機能付き）に統合しています。ダッシュボードから新規にリポジトリをインポートすると「Workers」プロジェクトとして作成されるため、本ツールもその形式（単一Workerスクリプト + 静的アセット + D1）で構成しています。

- **論文データ**（`public/data/papers.json`）：読み取り専用の静的アセット。CSVから変換済み。
- **レビュー結果**（含める/除外/要確認・カテゴリ・コメント）：Cloudflare D1に保存。複数人が同時に書き込める共有データ。
- **`worker/index.js`**：`/api/reviews` へのリクエストを処理し、それ以外は静的アセットにフォールバックする単一のWorkerスクリプト。
- フロントエンドはビルド不要の素のHTML/CSS/JS（`public/`）。

## デプロイ手順

前提：`wrangler` がインストール済み（`npm install -g wrangler` または `npx wrangler`）、Cloudflareアカウントにログイン済み（`wrangler login`）。

### 1. D1データベースを作成

```bash
wrangler d1 create yanagawa_screening_db
```

出力される `database_id` を `wrangler.toml` の `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` に貼り付けてください。

### 2. スキーマを適用

```bash
wrangler d1 execute yanagawa_screening_db --remote --file=./schema.sql
```

### 3. GitHubにpush

```bash
cd yanagawa-screening
git init
git add .
git commit -m "Workers static assets構成に修正"
git remote add origin <あなたのリポジトリURL>
git push -u origin main
```

### 4. デプロイ

**Git連携（Workers Builds）を使っている場合**：`wrangler.toml`に`database_id`を正しく設定して push すれば、次のビルドから自動的に `npx wrangler deploy` が成功します。Pagesと違い、D1などのバインディングは `wrangler.toml` に書いた内容がそのまま使われるので、ダッシュボード側で別途バインディング設定をする必要はありません。

**手元から直接デプロイする場合**：

```bash
wrangler deploy
```

### 5. 動作確認

デプロイ後のURL（`https://noritetsu-yanagawa-screening.<あなたのworkers.devサブドメイン>.workers.dev` など。ダッシュボードの「Workers & Pages」からカスタムドメイン設定も可能）にアクセスし、右上に評価者名（例：阿部）を入力してから、いずれかの文献で判定ボタンを押して「保存」。ページを再読み込みして反映されていればOKです。

## 今回のエラーについて

ビルドログの `Executing user deploy command: npx wrangler deploy` と `Missing entry-point to Worker script or to assets directory` は、旧来の「Cloudflare Pages」形式の`wrangler.toml`（`pages_build_output_dir`のみ）のまま、新しい統合後の「Workers」プロジェクトとしてビルドが実行されたために起きたものです。今回`main`（Workerスクリプトの場所）と`[assets]`（静的アセットの場所）を明示したので解消されるはずです。

## 使い方

- 右上の「評価者」欄に自分の名前を入れる（自由入力、次回からブラウザに記憶されます）
- 各文献カードで「含める／要確認／除外」を選び、除外・要確認の場合は理由カテゴリを選択、必要ならコメントを入力して「保存」
- 上部の水位ゲージが全体の評価進捗を示します
- フィルタチップで「対立あり」（評価者間で判定が割れたもの）だけを絞り込めるので、いつみんさんとの調停作業に使えます
- 「CSVでエクスポート」で、その時点の全判定結果をCSVとして書き出せます（従来のスプレッドシート作業に戻したい時用）

## 注意点

- 認証機能はありません。評価者名は自由入力のテキストなので、社内の信頼できるメンバー間での利用を想定しています。外部に公開したくない場合はCloudflare Accessでのアクセス制限を検討してください。
- 論文データ自体（`papers.json`）は静的ファイルなので、リスト自体を更新したい場合はファイルを差し替えて再デプロイしてください。

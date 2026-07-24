# 柳川文献スクリーニングツール

柳川レビュー論文プロジェクト用の、複数人向け文献スクリーニングツールです。
Google Scholarから収集した1,185件の文献リストを、評価者ごとに「含める／要確認／除外」で判定し、コメントを残せます。判定が割れた文献は自動的に「対立」として検出されます。

## 構成

- **論文データ**（`public/data/papers.json`）：読み取り専用の静的データ。CSVから変換済み。
- **レビュー結果**（含める/除外/要確認・カテゴリ・コメント）：Cloudflare D1に保存。複数人が同時に書き込める共有データ。
- フロントエンドはビルド不要の素のHTML/CSS/JS、バックエンドはCloudflare Pages Functions。

## デプロイ手順

前提：`wrangler` がインストール済み（`npm install -g wrangler` または `npx wrangler`）、Cloudflareアカウントにログイン済み（`wrangler login`）。

### 1. GitHubリポジトリを作成してpush

いつものパターンで、NORIDOMI-IRON-WORKS orgに新規リポジトリ（例: `yanagawa-screening`）を作り、このフォルダの中身をpushしてください。

```bash
cd yanagawa-screening
git init
git add .
git commit -m "初期構築: 柳川文献スクリーニングツール"
git remote add origin https://github.com/<org>/yanagawa-screening.git
git push -u origin main
```

### 2. D1データベースを作成

```bash
wrangler d1 create yanagawa_screening_db
```

出力される `database_id` を `wrangler.toml` の `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"` に貼り付けてください。

### 3. スキーマを適用

```bash
wrangler d1 execute yanagawa_screening_db --remote --file=./schema.sql
```

### 4. Cloudflare Pagesプロジェクトを作成してデプロイ

GitHub連携でCloudflare Pagesダッシュボードから接続する場合：
- ビルドコマンド：なし（空欄）
- ビルド出力ディレクトリ：`public`
- **Settings → Functions → D1 database bindings** で、変数名 `DB` を先ほど作成した `yanagawa_screening_db` に紐付けてください（ここを忘れるとAPIが動きません）。

またはCLIから直接デプロイする場合：

```bash
wrangler pages deploy public --project-name=noritetsu-yanagawa-screening
```
※ この場合もCloudflareダッシュボード側でD1バインディング（`DB`）の設定を忘れずに行ってください。CLIのwrangler.tomlに書いたD1設定はPages Functionsには自動反映されないことがあるため、ダッシュボードでの確認を推奨します。

### 5. 動作確認

デプロイ後のURL（`https://noritetsu-yanagawa-screening.pages.dev` など）にアクセスし、右上に評価者名（例：阿部）を入力してから、いずれかの文献で判定ボタンを押して「保存」。ページを再読み込みして反映されていればOKです。

## 使い方

- 右上の「評価者」欄に自分の名前を入れる（自由入力、次回からブラウザに記憶されます）
- 各文献カードで「含める／要確認／除外」を選び、除外・要確認の場合は理由カテゴリを選択、必要ならコメントを入力して「保存」
- 上部の水位ゲージが全体の評価進捗を示します
- フィルタチップで「対立あり」（評価者間で判定が割れたもの）だけを絞り込めるので、いつみんさんとの調停作業に使えます
- 「CSVでエクスポート」で、その時点の全判定結果をCSVとして書き出せます（従来のスプレッドシート作業に戻したい時用）

## 注意点

- 認証機能はありません。評価者名は自由入力のテキストなので、社内の信頼できるメンバー間での利用を想定しています。外部に公開したくない場合はCloudflare Access等でのアクセス制限を検討してください。
- 論文データ自体（`papers.json`）は静的ファイルなので、リスト自体を更新したい場合はファイルを差し替えて再デプロイしてください。

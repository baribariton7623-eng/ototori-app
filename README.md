# 音取りアプリ (Ototori-app)

合唱団員・指揮者向けの音取り練習ツール。曲(作品→楽章)を選ぶとパートごとのメロディ音源(電子音)を再生できる。

仕様の詳細は [oto-tori-spec.md](./oto-tori-spec.md) を参照。

## セットアップ

```bash
npm install
npm run dev
```

Supabase連携(お気に入り・ミュート設定・練習履歴の保存)を有効にするには `.env.example` を `.env` にコピーし、Supabaseプロジェクトの URL / anon key を設定する。未設定でもログイン不要のコア機能(曲選択・再生)は動作する。

### Supabaseプロジェクトの作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成する
2. プロジェクトの Settings → API から `Project URL` と `anon public` キーを取得し、`.env` の `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` に設定する
3. SQL Editor で `supabase/migrations/0001_init.sql` の内容を実行し、`favorites` / `part_mute_settings` / `practice_history` テーブル(すべて Row Level Security 有効・`auth.uid()` に紐付く行のみ読み書き可)を作成する
4. Authentication → Sign In / Providers で `Email`(マジックリンク)を有効化する。Google連携は次項を参照

### Google OAuth設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、「APIとサービス」→「認証情報」から OAuth 2.0 クライアントID(種類: ウェブアプリケーション)を作成する
2. 「承認済みのリダイレクトURI」に SupabaseプロジェクトのコールバックURL(`https://<project-ref>.supabase.co/auth/v1/callback`。Supabase側の Authentication → Providers → Google の設定画面に表示される)を追加する
3. 発行された クライアントID / クライアントシークレット を、Supabaseダッシュボードの Authentication → Providers → Google に入力し有効化する
4. アプリ側の追加設定は不要(`src/components/AuthPanel.tsx` が `supabase.auth.signInWithOAuth({ provider: 'google' })` を呼ぶのみ)。ローカル開発(`http://localhost:5173`)や本番ドメインを Supabase の Authentication → URL Configuration の `Site URL` / `Redirect URLs` に追加しておくこと

### Netlifyデプロイ

1. [Netlify](https://app.netlify.com) で GitHubリポジトリを連携し新規サイトを作成する。ビルド設定は `netlify.toml` に定義済み(`npm run build` / publish: `dist`)なので追加設定は不要
2. Site configuration → Environment variables に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定する(未設定の場合はログイン機能なしでデプロイされる)
3. デプロイ後に発行される本番URLを、Supabaseの Authentication → URL Configuration の `Site URL` / `Redirect URLs`、および Google Cloud Console の「承認済みのリダイレクトURI」に追加する(ローカル開発用と本番用を両方登録可能)

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run build` — 型チェック + 本番ビルド
- `npm run preview` — 本番ビルドのプレビュー
- `npm test` — vitest でユニットテスト実行
- `npm run typecheck` — 型チェックのみ
- `npm run data:convert` — `content/musicxml/**` の MusicXML を `public/data/works/**` の内部データ形式に変換
- `npm run data:validate` — 変換済みデータの拍数整合性などをチェック

## 曲データの追加方法

1. MuseScore 等でパートごとに音符を入力し `content/musicxml/<work-id>/<movement-id>.musicxml` として書き出す
2. `npm run data:convert` を実行し `public/data/works/**` を生成
3. `npm run data:validate` で整合性を確認

# 音取りアプリ (Ototori-app)

合唱団員・指揮者向けの音取り練習ツール。曲(作品→楽章)を選ぶとパートごとのメロディ音源(電子音)を再生できる。

仕様の詳細は [oto-tori-spec.md](./oto-tori-spec.md) を参照。

## セットアップ

```bash
npm install
npm run dev
```

Supabase連携(お気に入り・ミュート設定・練習履歴の保存)を有効にするには `.env.example` を `.env` にコピーし、Supabaseプロジェクトの URL / anon key を設定する。未設定でもログイン不要のコア機能(曲選択・再生)は動作する。

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

## レパートリー管理アプリ(生徒・講師向け)

同じリポジトリに同居する別エントリ(`repertoire.html` / `src/repertoire/`)。生徒がログインして自分のレパートリー(作曲家・作品名・ステータス・メモ・レッスン日)を登録し、講師アカウントで全生徒分を一覧できる。

- 開発時: `npm run dev` 後に `http://localhost:5173/repertoire.html`
- 本番(Netlify): `https://<サイト>/repertoire/`(`netlify.toml` のリダイレクトで `repertoire.html` に振り分け)
- ログインは必須。認証は音取りアプリ本体と同じ Supabase プロジェクト(Google OAuth / マジックリンク)を共用する

### 初期設定(Supabase)

1. Supabase ダッシュボードの SQL Editor で `supabase/migrations/0002_repertoire.sql` を実行する(`0001_init.sql` 適用済みが前提)。
   `profiles`(役割・表示名)と `repertoire_entries`(登録曲)が作成され、新規ユーザーは自動的に生徒(`student`)として登録される。
2. Authentication → URL Configuration → Redirect URLs に、ログイン後の戻り先を追加する。
   - 開発: `http://localhost:5173/repertoire.html`
   - 本番: `https://<サイト>/repertoire.html`
3. 講師アカウントは、該当ユーザーが一度ログインしたあとに SQL Editor で役割を変更する。

   ```sql
   update public.profiles
   set role = 'teacher'
   where id = (select id from auth.users where email = 'teacher@example.com');
   ```

   講師に戻す・生徒に戻すのも同じ SQL で `role` を `'student'` にすればよい。役割はアプリ側からは変更できない(RLS と列権限で保護)。

### 権限の設計

- 生徒: 自分の登録曲のみ閲覧・追加・編集・削除。表示名(講師画面に出る名前)を自分で変更できる
- 講師: 全生徒の登録曲とプロフィール(表示名)を閲覧のみ。編集・削除はできない
- いずれも Postgres の RLS で強制され、フロント側の判定は表示の出し分けにしか使っていない

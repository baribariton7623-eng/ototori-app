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

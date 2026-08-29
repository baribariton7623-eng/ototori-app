# Ototori-app 作業規範

合唱団向け音取り練習Webアプリ。仕様書は `oto-tori-spec.md`。

## 技術スタック

React 19 + Vite 8 + TypeScript 6 + Tailwind 4 + Tone.js 15 + Supabase。Cantata-appのスタック型ナビゲーションパターンを踏襲したが、Tailwind 4は`@tailwindcss/vite`プラグイン方式(tailwind.config.js不要)を採用しており、Cantata-appのTailwind 3系設定とは別物。

## アーキテクチャ

- 内部データ型(`src/types/music.ts`): Work>Movement>Part>NoteOrRest階層、拍数ベース、弱起・タイ・テンポイベント対応
- MusicXML変換パイプライン(`scripts/musicxml/`): `musicxml-interfaces`は2022年で更新停止のため`fast-xml-parser`+自前ロジックを使用
- Tone.js再生エンジン(`src/audio/PlaybackEngine.ts`): テンポ変更・小節シーク・A-Bリピート・ミュート/音量

## 既知の制約

- MusicXMLパーサは`<backup>/<forward>`による同一パート内複数声部(1段に2声部が同居する記譜)に非対応。合唱パートを別々の`<part>`として書き出す運用が前提
- `content/musicxml/dona-nobis-pacem/round.musicxml`は自作の3声輪唱（パイプライン検証・デモ用のオリジナル曲であり、実際の伝承旋律の正確な採譜ではない）
- iOS Safari実機でのWake Lock/音声再生の最終確認は未実施(ヘッドレスブラウザでは自動再生制限が無効化されており検証不能)

## 現状メモ（2026-08時点）

MVP一式(コア再生・Supabase認証・Netlifyデプロイ設定)は実装済み、全46 vitestテストパス(5ファイル)、本番ビルド確認済み。依存パッケージのhigh severity脆弱性(fast-xml-parser/nanoid/postcss)は`npm audit fix`で解消済み。Supabaseプロジェクト作成・Google OAuth設定・Netlifyデプロイの具体手順はREADME.mdに記載済み。次の実作業は本物の合唱曲(メサイア等)のMusicXML入力・変換だが、著作権的にクリアな入力元(CPDL等)の選定がまだ済んでいない。

# レッスン予約サービス (lesson-booking)

講師(主催者)の複数 Google カレンダーと連携してレッスンの空き枠を出し、生徒が **40 日先まで** 予約できるバックエンド API。
レッスン開始まで **2 週間未満** のキャンセル・変更は、生徒がメッセージと対応方法(承認を求める / 2 週間以内の別日に振替 / キャンセルフィーを支払う)を添えて申請し、主催者が承認するまで確定しない。

仕様の詳細は [docs/spec.md](./docs/spec.md)、API スキーマは [openapi.yaml](./openapi.yaml)。

このディレクトリは単体で動く独立プロジェクトで、そのまま別リポジトリへ移せる。

## 技術スタック

Node.js 22 / TypeScript / Express 5 / zod / googleapis / Supabase (Postgres) / vitest

## セットアップ(ローカル・DB も Google も不要)

```bash
cd lesson-booking
npm install
cp .env.example .env      # 既定は AUTH_MODE=dev, STORAGE=memory, CALENDAR=fake
npm run dev               # http://localhost:8787
```

ローカルでは `x-dev-user-email` ヘッダで利用者を指定する(日本語名は `x-dev-user-name` に URL エンコードで)。

```bash
B=http://localhost:8787
# 主催者登録(このメールが主催者になる)
curl -s -H x-dev-user-email:teacher@example.com -H content-type:application/json \
  -X POST $B/hosts -d '{"displayName":"講師A","lessonMinutes":60}'
# → 返ってきた id を HID に
curl -s -H x-dev-user-email:teacher@example.com -H content-type:application/json \
  -X POST $B/hosts/$HID/availability-windows -d '{"weekday":1,"startTime":"10:00","endTime":"18:00"}'
curl -s -H x-dev-user-email:teacher@example.com -H content-type:application/json \
  -X POST $B/hosts/$HID/calendars -d '{"calendarId":"primary","role":"write_target"}'
# 空き枠(公開)
curl -s "$B/hosts/$HID/slots"
# 生徒が予約
curl -s -H x-dev-user-email:student@example.com -H content-type:application/json \
  -X POST $B/bookings -d "{\"hostId\":\"$HID\",\"startAt\":\"2026-10-05T01:00:00Z\"}"
# 直前キャンセル(メッセージ+対応方法が必須 → 202 承認待ち)
curl -s -H x-dev-user-email:student@example.com -H content-type:application/json \
  -X POST $B/bookings/$BID/change -d '{"kind":"cancel","message":"急用のため","option":"request_approval"}'
# 主催者が承認
curl -s -H x-dev-user-email:teacher@example.com $B/hosts/$HID/change-requests
curl -s -H x-dev-user-email:teacher@example.com -H content-type:application/json \
  -X POST $B/hosts/$HID/change-requests/$RID/decision -d '{"decision":"approve"}'
```

## フロントエンド(web/)

生徒画面(空き枠から予約 / マイ予約 / キャンセル・変更の申請)と主催者画面(承認待ちの処理 / 予約一覧 / 営業時間枠・カレンダー・Google 連携の設定)。React 19 + Vite + Tailwind 4。

```bash
cd lesson-booking/web
npm install
cp .env.example .env      # VITE_AUTH_MODE=dev(バックエンドの AUTH_MODE と合わせる)
npm run dev               # http://localhost:5174 → API は 8787 へプロキシ
```

本番は `cd web && npm run build` すると `web/dist` ができ、バックエンドが同じオリジンで静的配信する(`WEB_DIST` 環境変数)。
`VITE_AUTH_MODE=supabase` のときは Supabase Auth の Google ログインを使う(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)。

- 初回は「講師の方」から主催者登録 → 設定タブで営業時間枠と連携カレンダーを登録すると、生徒側に空き枠が出る
- 開始まで 14 日未満の予約は「変更は承認制」バッジが付き、キャンセル・変更ダイアログでメッセージと 3 択が必須になる

## スクリプト

- `npm run dev` — 開発サーバー(ファイル変更で再起動)
- `npm run build` / `npm start` — ビルドして起動
- `npm test` — vitest(業務ルール・空き枠・予約サービス・API)
- `npm run typecheck` — 型チェック
- (web/) `npm run dev` / `npm run build` / `npm run typecheck`

## 本番構成

### 1. Supabase(永続化・認証)
1. Supabase プロジェクトを作成し、SQL Editor で `supabase/migrations/0001_init.sql` を実行
2. `.env` に `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` を設定
3. 認証を Supabase Auth に切り替える場合は `AUTH_MODE=supabase`, `SUPABASE_JWT_SECRET`(Project Settings → API → JWT Secret)を設定。クライアントは Supabase Auth でログインし、`Authorization: Bearer <access_token>` を付けて API を呼ぶ

### 2. Google カレンダー
1. Google Cloud Console で OAuth クライアント(Web アプリ)を作成し、Calendar API を有効化
2. リダイレクト URI に `https://<api-host>/google/callback` を登録
3. `.env` に `CALENDAR=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` を設定
4. 主催者としてログインし `GET /hosts/{hostId}/google/connect` の `url` をブラウザで開いて同意 → refresh token が保存される
5. `POST /hosts/{hostId}/calendars` で連携するカレンダーを登録
   - `role: write_target` … 予約確定時にイベントを書き込む(1 件)。空き枠計算でも予定ありとして扱う
   - `role: busy_source` … 空き枠計算で予定ありとして扱うだけ(複数可)。calendarId は Google カレンダーの設定画面「カレンダー ID」

### 3. デプロイ
`npm run build` 後 `node dist/server.js`。常駐 Node が動く環境(Render / Fly.io / Railway / Cloud Run など)を想定。ポートは `PORT`。

## ディレクトリ

```
web/                  フロントエンド(React + Vite)。src/screens が画面、src/api がAPIクライアントと認証
src/
  domain/        型・業務ルール(40日/14日/振替範囲)・空き枠計算・時刻ヘルパ(純関数)
  services/      AvailabilityService(空き枠) / BookingService(予約・変更要求・承認)
  calendar/      CalendarClient インターフェース / Google 実装 / Fake 実装
  repo/          Repository インターフェース / InMemory 実装 / Supabase 実装
  http/          Express アプリ・認証ミドルウェア
  server.ts      エントリポイント(環境変数で実装を差し替え)
supabase/migrations/  スキーマ SQL
docs/spec.md          仕様書
openapi.yaml          API 定義
test/                 vitest
```

## 未実装・今後

- 通知(メール・LINE 等) — `Notifier` インターフェースに差し込む
- 決済 — キャンセルフィーは「支払う意思」と「入金確認」のフラグのみ
- 実 Supabase / 実 Google アカウントでの結合テスト

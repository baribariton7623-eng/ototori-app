# レッスン予約サービス (lesson-booking)

講師(主催者)の複数 Google カレンダーと連携してレッスンの空き枠を出し、生徒が **40 日先まで** 予約できるバックエンド API。
レッスン開始まで **2 週間未満** のキャンセル・変更は、生徒がメッセージと対応方法(承認を求める / 2 週間以内の別日に振替 / キャンセルフィーを支払う)を添えて申請し、主催者が承認するまで確定しない。

複数の講師がそれぞれ専用の公開予約ページ(`/#/h/<slug>`)を持つ SaaS 構成。フリー/プロのプランと Stripe 課金を備える。

仕様の詳細は [docs/spec.md](./docs/spec.md)、API スキーマは [openapi.yaml](./openapi.yaml)、サービスとして販売する際の整理は [docs/business.md](./docs/business.md)。

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

- 初回は「講師の方」から主催者登録(URL 名を決める)→ 設定タブで営業時間枠と連携カレンダーを登録 → 「生徒に共有する予約ページ」の URL を生徒に送る
- 生徒はその URL をログインなしで開いて空き枠を見られ、予約時にログインする
- 「何日先まで予約できるか(既定 40 日)」「開始の何日前から承認制にするか(既定 14 日)」「振替を受け付ける期間(既定 前後 7 日)」は、講師が設定画面の「予約・キャンセルのルール」で変更できる
- 開始まで 14 日未満の予約は「変更は承認制」バッジが付き、キャンセル・変更ダイアログでメッセージと 3 択が必須になる

## テスト

| コマンド | 内容 | 必要なもの |
| --- | --- | --- |
| `npm test` | 単体・API テスト(インメモリ) | なし |
| `npm run test:db` | 同じテストスイートを、実 PostgreSQL + PostgREST 上の Supabase 実装で実行。マイグレーション 0001〜 の適用も確認 | PostgreSQL(既定 `postgres://postgres:postgres@127.0.0.1:5432/postgres`、`TEST_DATABASE_ADMIN_URL` で変更)。PostgREST は Linux x64 なら自動で取得(他は `POSTGREST_BIN`) |
| `npm run test:e2e` | ブラウザでの通しテスト(Playwright、`e2e/`)。サーバーとブラウザの時計を 2026-10-01 09:00 JST に固定 | 初回のみ `npx playwright install chromium` |

CI(`.github/workflows/lesson-booking.yml`)は `lesson-booking/` に変更があると、上の 3 つを GitHub Actions で実行する。

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

### 3. 通知メール(Resend)
1. Resend でアカウントを作り、送信元ドメインを追加して DNS に SPF / DKIM レコードを設定
2. `.env` に `MAIL=resend`, `RESEND_API_KEY`, `MAIL_FROM="レッスン予約 <noreply@あなたのドメイン>"`, `SERVICE_NAME`
3. ローカルは `MAIL=console` のままで、送信内容がサーバーログに出る

送るメール: 予約確定・新しい予約・キャンセル/変更完了・申請受付・要承認・申請結果・休講のお知らせ・前日リマインド(一覧は spec.md §3.6)。

前日リマインドは定期実行が必要。`.env` に `CRON_SECRET` を設定し、外部 cron(Render Cron Job、GitHub Actions の schedule、cron-job.org など)から毎時次を実行する。

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<api-host>/internal/cron/reminders
```

サーバーが 1 台だけなら、代わりに `REMINDER_INTERVAL_MINUTES=60` でサーバー内で実行してもよい(複数台で有効にすると二重送信の可能性がある)。

### 4. Stripe(プロプラン課金)
1. Stripe で商品「プロプラン」と月額 Price を作成 → `STRIPE_PRICE_ID_PRO`
2. Webhook `https://<api-host>/billing/webhook` を登録し `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` を購読 → `STRIPE_WEBHOOK_SECRET`
3. Customer Portal を有効化
4. `.env` に `BILLING=stripe`, `STRIPE_SECRET_KEY`, `APP_BASE_URL`(フロントの公開 URL)

ローカルは `BILLING=fake` のまま、設定画面の「プロプランにアップグレード」で即時にプロになる。プランの上限は `src/domain/plans.ts`。

キャンセルフィーのカード決済(プロ限定、Stripe Connect):
1. Stripe ダッシュボードで Connect を有効化(アカウントタイプは Standard)
2. 「連結アカウント」のイベントを受ける Webhook を `https://<api-host>/billing/connect-webhook` に別途登録し、`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated` を購読 → `STRIPE_CONNECT_WEBHOOK_SECRET`
3. 講師は設定画面の「キャンセルフィー」で金額を入れ、「Stripe と連携する」から本人確認・口座登録を行う。売上は講師の口座に直接入り、運営者は預からない

キャンセルフィーの支払い方法は、クレジットカード・銀行振込・次回レッスン時に手渡しの 3 つ。講師が受け付ける方法と振込先を設定し、生徒が申請時に選んだ方法を講師がキャンセルとあわせて承認する。承認後も講師が予約一覧から方法を変更できる。

ローカル(`BILLING=fake`)では「Stripe と連携する」「カードで支払う」が即時に完了する。

教室プラン(席数課金): Stripe で「講師 1 人あたり月額」の Price を作り `STRIPE_PRICE_ID_ORG_SEAT` に設定する。Webhook は個人プランと同じ `/billing/webhook` で、顧客 ID から教室の契約かを判別する。講師画面の「教室」タブから作成・招待・契約する。

### 5. 運営者情報と法務ページ
`web/.env` の `VITE_OPERATOR_NAME` などを設定してから `cd web && npm run build`。
利用規約 `/terms`、プライバシーポリシー `/privacy`、特定商取引法に基づく表記 `/tokushoho` に反映される。未設定の項目は赤字で「未設定」と表示される。文面はひな形のため、公開前に専門家の確認を推奨。

### 6. Google OAuth 審査
講師が 100 人を超える前に審査を通す必要がある。手順と文案は [docs/google-oauth-verification.md](./docs/google-oauth-verification.md)。

### 7. デプロイ
API と画面を 1 つのコンテナで配信する `Dockerfile` がある。画面に埋め込む `VITE_*` はビルド時に `--build-arg` で渡す。

```bash
docker build -t lesson-booking --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... --build-arg VITE_OPERATOR_NAME=... .
docker run -p 8787:8787 --env-file .env lesson-booking
```

Render を使う場合は `render.yaml`(ブループリント)を読み込むと、Web サービスと前日リマインド用の cron(毎時)が作られる。秘密情報は Render の画面で入力する。

**本番の安全装置**: `NODE_ENV=production`(Docker イメージの既定)では、開発用の設定(`AUTH_MODE=dev` / `STORAGE=memory` / `BILLING=fake` / `FAKE_NOW` / http の `APP_BASE_URL`)のままだと起動を拒否する。カレンダー・メール・リマインドが動かない設定は警告をログに出す。

### 8. 単独リポジトリへの移動
`lesson-booking/` は単独で動く構成になっている。移すときは:
1. `lesson-booking/` の中身を新しいリポジトリの直下に置く
2. `.github/workflows/lesson-booking.yml`(ototori-app の直下にある)を新リポジトリの `.github/workflows/` に移し、`paths`・`working-directory`・`cache-dependency-path` の `lesson-booking/` を外す
3. `render.yaml` の `rootDir: lesson-booking` を外す

## ディレクトリ

```
web/                  フロントエンド(React + Vite)。src/screens が画面、src/api がAPIクライアントと認証
src/
  domain/        型・業務ルール(40日/14日/振替範囲)・空き枠計算・時刻ヘルパ(純関数)
  services/      AvailabilityService(空き枠) / BookingService(予約・変更要求・承認)
  calendar/      CalendarClient インターフェース / Google 実装 / Fake 実装
  billing/       BillingProvider インターフェース / Stripe 実装 / Fake 実装
  notify/        Notifier(業務イベント)/ EmailNotifier / メール文面 / 送信手段(Resend・コンソール・メモリ)
  repo/          Repository インターフェース / InMemory 実装 / Supabase 実装
  http/          Express アプリ・認証ミドルウェア
  server.ts      エントリポイント(環境変数で実装を差し替え)
supabase/migrations/  スキーマ SQL
docs/spec.md          仕様書
openapi.yaml          API 定義
test/                 vitest
```

## 未実装・今後

- 実 Supabase / 実 Google / 実 Stripe / 実 Resend での結合確認
- 一括休講(期間指定で複数の予約をまとめて取り消す)

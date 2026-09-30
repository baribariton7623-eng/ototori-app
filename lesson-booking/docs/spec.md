# レッスン予約サービス 仕様書

講師(主催者)が持つ複数の Google カレンダーと連携し、生徒がレッスンの空き枠を予約できる Web サービス。
直前(レッスン開始まで 2 週間未満)のキャンセル・変更は、生徒がメッセージと対応方法を添えて申請し、主催者が承認するまで確定しない。

本書は「ChatGPT など別の開発環境でも実装を引き継げること」を目的に、業務ルール・データモデル・API を実装から独立して記述する。実装の現状は末尾「実装状況」を参照。

---

## 1. 用語

| 用語 | 意味 |
| --- | --- |
| 主催者 (host) | レッスンを提供する講師。Google カレンダーを連携し、営業時間枠を設定し、直前変更を承認する |
| 生徒 (student) | レッスンを予約する利用者 |
| 営業時間枠 (availability window) | 曜日ごとの「この時間帯なら予約を受ける」範囲。主催者のタイムゾーンで `HH:MM`〜`HH:MM` |
| 空き枠 (slot) | 営業時間枠をレッスン長で刻んだもののうち、連携カレンダーの予定・既存予約と重ならないもの |
| 予約 (booking) | 生徒がある空き枠を確定させたもの。状態は `confirmed` / `cancelled` |
| 変更要求 (change request) | 直前のキャンセル・変更に対する承認申請。状態は `pending` / `approved` / `rejected` |
| 直前 (late) | 操作時点からレッスン開始まで **14 日未満** |

## 2. ロールと権限

| 操作 | 生徒 | 主催者 |
| --- | --- | --- |
| 空き枠の閲覧 | ○(ログイン不要) | ○ |
| 予約の作成・自分の予約の閲覧 | ○ | -(自分の全予約は閲覧可) |
| 猶予ありのキャンセル・変更(即時) | ○(自分の予約のみ) | - |
| 直前の変更要求の申請 | ○(自分の予約のみ) | - |
| 変更要求の承認・却下 | - | ○(自分宛のみ) |
| 営業時間枠・連携カレンダーの設定 | - | ○(自分のもののみ) |
| Google カレンダー連携(OAuth) | - | ○ |
| キャンセルフィー入金確認 | - | ○ |

- 認証: Supabase Auth の JWT(本番)/ 開発用ヘッダ(ローカル)。
- ログインユーザーの email が `hosts` に登録されていれば主催者、そうでなければ生徒として扱う(生徒は初回操作時に自動登録)。

## 3. 業務ルール

### 3.1 予約受付ウィンドウ
- 予約できるのは **操作時点から 40 日先まで**(`BOOKING_HORIZON_DAYS = 40`)。開始時刻が `now + 40日` 以下の枠のみ。
- 直近側は主催者設定のリード時間(`minLeadMinutes`, 既定 60 分)より先の枠のみ。
- 振替先の枠にも同じウィンドウを適用する。

### 3.2 空き枠の計算
```
空き枠 = { 営業時間枠を lessonMinutes 刻みで切った枠 }
        − { 連携カレンダー(全件)の busy と重なる枠 }
        − { 同じ主催者の確定予約と重なる枠 }
        ∩ 予約受付ウィンドウ
```
- 重なりは半開区間で判定する(終了 = 次の開始 は重ならない)。
- 曜日判定・時刻は主催者のタイムゾーン(既定 `Asia/Tokyo`)で行い、API 上は UTC の ISO 8601 で返す。
- レッスン長が枠に収まらない端は出さない(10:00–11:30 の枠、60 分レッスンなら 10:00 のみ)。
- 連携カレンダーの busy は Google Calendar `freebusy.query` で複数カレンダーをまとめて取得する。

### 3.3 予約作成
1. 受付ウィンドウ内か検証(外なら `outside_booking_window`)
2. 予約直前にその枠が空きか再計算(埋まっていれば `slot_unavailable`)
3. `confirmed` で保存
4. 主催者に `write_target` カレンダーがあればイベントを作成し、`calendarEventId` を保存
   - 件名: `レッスン: <生徒名>`、本文に予約 ID・生徒メール・備考、参加者に生徒メール

### 3.4 キャンセル・変更(生徒)
判定は **操作時点** で行う。予約時に猶予があっても、時間が経って 14 日未満になれば直前扱いになる。

| 状況 | 挙動 |
| --- | --- |
| レッスン開始まで 14 日以上 | 即時反映。キャンセル → `cancelled` + カレンダーイベント削除。変更 → 新枠の空きを確認して日時更新 + イベント更新 |
| 14 日未満(直前) | **メッセージ(必須)** と **対応方法(3 択、必須)** を添えて変更要求を作成。予約は `confirmed` のまま。主催者の判断を待つ |

対応方法(`LateChangeOption`):

| 値 | 表示 | 意味 |
| --- | --- | --- |
| `request_approval` | 事情を説明して承認を求める | そのままキャンセル/変更の承認を求める |
| `reschedule_within_two_weeks` | 2週間以内の別日に振替を希望する | 元のレッスン日から **前後 14 日以内** の空き枠を `proposedStartAt` で指定する(必須) |
| `pay_cancellation_fee` | キャンセルフィーを支払う | 承認時に予約の `cancellationFeeStatus` を `pending` にする。決済は本サービスの範囲外(主催者が入金確認で `paid` にする) |

制約:
- 1 予約につき `pending` の変更要求は 1 件まで(`change_request_pending`)。
- 開始済み・終了済み・キャンセル済みの予約は変更できない(`invalid_state`)。
- `kind = reschedule` の場合は `proposedStartAt` 必須。振替先は要求時点でも受付ウィンドウ内・空きであることを検証する(承認時にも再検証)。
- 承認待ちの間、元の枠は確定予約として扱い、他の生徒には空きとして見せない。

### 3.5 承認・却下(主催者)

| 判断 | kind=cancel | kind=reschedule |
| --- | --- | --- |
| approve | 予約を `cancelled`、イベント削除。option が `pay_cancellation_fee` なら `cancellationFeeStatus = pending` | 振替先の空きを再検証し、日時更新 + イベント更新。元の枠は空きに戻る |
| reject | 予約は `confirmed` のまま維持 | 同左 |

- 判断メモ(`note`)を残せる。処理済み要求の再判断は不可。
- 主催者の直接キャンセル(生徒の申請なし)は現状スコープ外。

### 3.6 通知
メール等の送信は未実装。以下のフックポイントを `Notifier` インターフェースとして用意している: 予約作成 / 予約変更反映 / 変更要求作成 / 変更要求の判断。

## 4. データモデル

Postgres(Supabase)。時刻は `timestamptz`(UTC)。表示は主催者のタイムゾーン。SQL は `supabase/migrations/0001_init.sql`。

```
lb_hosts                    主催者
  id, email(unique), display_name, timezone, lesson_minutes, min_lead_minutes, created_at
lb_host_google_credentials  Google OAuth refresh token(主催者と 1:1、service role のみ参照)
  host_id(pk), refresh_token, updated_at
lb_host_calendars           連携カレンダー(role: busy_source | write_target。write_target は主催者ごとに 1 件)
  id, host_id, calendar_id, label, role
lb_availability_windows     営業時間枠
  id, host_id, weekday(0=日), start_time 'HH:MM', end_time 'HH:MM'
lb_students                 生徒
  id, email(unique), name, created_at
lb_bookings                 予約
  id, host_id, student_id, start_at, end_at, status(confirmed|cancelled),
  calendar_event_id, note, cancellation_fee_status(none|pending|paid), created_at, updated_at
  unique(host_id, start_at) where status='confirmed'   -- 二重予約防止
lb_change_requests          変更要求
  id, booking_id, host_id, student_id, kind(cancel|reschedule),
  option(request_approval|reschedule_within_two_weeks|pay_cancellation_fee),
  message, proposed_start_at, status(pending|approved|rejected), decision_note, created_at, decided_at
  unique(booking_id) where status='pending'            -- pending は 1 件
```

RLS は全テーブル有効。API サーバーが service role で接続し、認可はアプリ層で行う(anon/authenticated からの直接アクセスは拒否)。

## 5. API

ベース: `/`。JSON。時刻は ISO 8601(オフセット付き可、応答は UTC `Z`)。詳細なスキーマは `openapi.yaml`。

### 認証ヘッダ
- 本番: `Authorization: Bearer <Supabase JWT>`
- ローカル(`AUTH_MODE=dev`): `x-dev-user-email: <email>`(任意で `x-dev-user-name: <URLエンコード名>`)

### 公開
| Method | Path | 説明 |
| --- | --- | --- |
| GET | `/health` | 稼働確認 |
| GET | `/rules` | 業務ルール定数(40 日・14 日・振替範囲・3 択のラベル) |
| GET | `/hosts` | 主催者一覧(公開情報のみ) |
| GET | `/hosts/{hostId}/slots?from&to` | 空き枠。`from`/`to` は受付ウィンドウで自動的にクリップ |

### 生徒
| Method | Path | 説明 |
| --- | --- | --- |
| GET | `/me` | 自分の情報とロール |
| POST | `/bookings` | 予約作成 `{hostId, startAt, note?}` → 201 |
| GET | `/bookings` | 自分の予約一覧(`requiresApprovalToChange` 付き) |
| GET | `/bookings/{id}` | 予約詳細 + 変更要求履歴 |
| POST | `/bookings/{id}/change` | キャンセル/変更 `{kind, message?, option?, proposedStartAt?}` → 200 `applied` / 202 `pending_approval` |

### 主催者
| Method | Path | 説明 |
| --- | --- | --- |
| POST | `/hosts` | ログイン中ユーザーを主催者登録 `{displayName, timezone?, lessonMinutes?, minLeadMinutes?}` |
| PATCH | `/hosts/{hostId}` | 主催者設定変更 |
| GET/POST | `/hosts/{hostId}/calendars` | 連携カレンダー一覧/追加 `{calendarId, label?, role}` |
| DELETE | `/hosts/{hostId}/calendars/{id}` | 連携解除 |
| GET/POST | `/hosts/{hostId}/availability-windows` | 営業時間枠一覧/追加 `{weekday, startTime, endTime}` |
| DELETE | `/hosts/{hostId}/availability-windows/{id}` | 削除 |
| GET | `/hosts/{hostId}/bookings` | 全予約(生徒情報付き) |
| GET | `/hosts/{hostId}/change-requests?status=pending\|approved\|rejected\|all` | 変更要求一覧(予約・生徒・3 択ラベル付き) |
| POST | `/hosts/{hostId}/change-requests/{id}/decision` | `{decision: approve\|reject, note?}` |
| POST | `/hosts/{hostId}/bookings/{id}/fee-paid` | キャンセルフィー入金確認 |
| GET | `/hosts/{hostId}/google/connect` | Google 認可 URL を返す |
| GET | `/hosts/{hostId}/google/status` | 連携済みか |
| DELETE | `/hosts/{hostId}/google` | 連携解除 |
| GET | `/google/callback?code&state` | Google からのリダイレクト先(state = hostId) |

### エラー形式
```json
{ "error": { "code": "slot_unavailable", "message": "…", "details": { } } }
```

| code | HTTP | 意味 |
| --- | --- | --- |
| `validation` | 400 | 入力不正(zod の issue が details) |
| `outside_booking_window` | 400 | 40 日先超・リード時間未満 |
| `late_change_requires_request` | 400 | 直前変更にメッセージ/対応方法がない |
| `forbidden` | 403 | 未ログイン・権限なし |
| `not_found` | 404 | 対象なし |
| `slot_unavailable` | 409 | 枠が空いていない |
| `change_request_pending` | 409 | 承認待ちがある |
| `invalid_state` | 409 | 状態遷移が不正 |
| `calendar_error` | 502 | Google 連携エラー・未連携 |

## 6. 画面・フロー(フロントエンド実装時の指針)

### 生徒
1. **主催者選択 → カレンダー表示**: `/hosts/{id}/slots` を週または月で表示。40 日より先はグレーアウトし「予約は 40 日先まで」と注記。
2. **予約確認**: 日時・レッスン長・備考入力 → `POST /bookings`。
3. **予約一覧**: `requiresApprovalToChange` が true の予約には「開始 2 週間以内のため変更には主催者の承認が必要です」と表示。
4. **キャンセル/変更ダイアログ**:
   - 猶予あり: 確認のみで即時反映。
   - 直前: メッセージ欄(必須)+ 対応方法ラジオ(3 択、`/rules` のラベルを使用)。「2 週間以内の別日に振替」を選んだ場合は元の日の前後 14 日の空き枠から選ぶピッカーを表示。送信後「主催者の承認をお待ちください」。
5. **予約詳細**: 変更要求の履歴(申請内容・主催者の判断・メモ)。

### 主催者
1. **初期設定**: 主催者登録 → Google 連携(認可 URL へ遷移 → callback) → 連携カレンダー登録(書き込み先 1 件 + 参照用複数) → 営業時間枠。
2. **承認待ち一覧**: 生徒名・元日時・種別・対応方法・メッセージ・振替希望日時。承認/却下ボタン + メモ。
3. **予約一覧**: 日付順。キャンセルフィー未払いのものに「入金確認」ボタン。

## 7. 非機能・運用
- タイムゾーン: 主催者ごとに設定可(既定 Asia/Tokyo)。DST のある地域も `Intl` で対応。
- 二重予約防止: アプリ層の再検証に加え、DB の部分ユニーク制約で保証。
- Google のレート制限・障害時は `calendar_error`(502)を返し、予約は作らない。
- refresh token は専用テーブルに分離し、service role 以外から読めない。
- 監査: `change_requests` に申請〜判断の履歴が残る。予約の変更履歴(元日時)は現状保持しない → 必要なら `booking_history` の追加を検討。

## 8. 実装状況(2026-09 時点)

| 項目 | 状態 |
| --- | --- |
| 業務ルール・空き枠計算・予約/変更/承認サービス | 実装済み(vitest 39 件) |
| REST API(Express) | 実装済み。dev 認証でローカル動作確認済み |
| インメモリ永続化 | 実装済み(ローカル・テスト用) |
| Supabase 永続化 | 実装済み(実 DB での結合テストは未実施) |
| Google Calendar 連携 | 実装済み(実アカウントでの動作確認は未実施) |
| Supabase JWT 認証 | 実装済み(実トークンでの確認は未実施) |
| フロントエンド(生徒・主催者画面) | 未実装(本書 §6 が指針) |
| 通知(メール等) | 未実装(`Notifier` フックのみ) |
| 決済 | スコープ外(入金確認フラグのみ) |

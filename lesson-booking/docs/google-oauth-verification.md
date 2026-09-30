# Google OAuth 審査 提出準備

講師が Google カレンダーを連携するには、Google Cloud の OAuth 同意画面を「本番」に公開し、機密スコープの審査を通す必要がある。
審査前は「テストユーザー」(最大 100 人)に手動登録した Google アカウントだけが連携でき、同意画面に「未確認のアプリ」警告が出る。

審査は 2〜6 週間かかるため、ベータ運用と並行して早めに出す。以下は提出時に入力・用意するものの一覧と、そのまま使える文案。

---

## 1. 事前に揃えるもの

| 項目 | 状態 | 備考 |
| --- | --- | --- |
| 独自ドメイン | 要取得 | 例 `example.jp`。Search Console で所有権を確認する |
| アプリのホームページ URL | 実装済み | `https://<ドメイン>/`(LP)。ログインなしで閲覧でき、アプリの目的が説明されていること |
| プライバシーポリシー URL | 実装済み | `https://<ドメイン>/privacy`。Limited Use の宣言を含む。**ホームページと同じドメイン**であること |
| 利用規約 URL | 実装済み | `https://<ドメイン>/terms` |
| 運営者情報 | 要設定 | `web/.env` の `VITE_OPERATOR_*`。未設定だとページに赤字で「未設定」と出る |
| サポート用メールアドレス | 要用意 | 同意画面に表示される |
| アプリのロゴ(120×120 px) | 要作成 | ロゴを登録するとブランド確認が必要になる。なしでも可 |
| デモ動画(YouTube 限定公開) | 要撮影 | 下記 §4 の台本 |

## 2. スコープと利用目的(英語で入力)

現在要求しているスコープ(`src/calendar/GoogleCalendarClient.ts` の `GOOGLE_SCOPES`):

| Scope | Why it is needed |
| --- | --- |
| `https://www.googleapis.com/auth/calendar.readonly` | To compute a teacher's available lesson slots, the app calls the FreeBusy API on the calendars the teacher explicitly selects. Only busy time ranges (start/end) are read; event titles, descriptions and attendees are never read or stored. Busy ranges are fetched on demand and not persisted. |
| `https://www.googleapis.com/auth/calendar.events` | When a student books a lesson, the app creates an event on the calendar the teacher designated as the booking calendar, and updates or deletes that same event when the booking is rescheduled or cancelled. The app only modifies events it created. |

審査で「より狭いスコープで足りないか」を問われることがある。検討候補:

- `calendar.readonly` → `https://www.googleapis.com/auth/calendar.freebusy`(空き状況の参照のみ)。FreeBusy API だけで空き枠を出しているため置き換えられる可能性が高いが、**実アカウントでの動作確認が済んでいないため未変更**。置き換える場合は `GOOGLE_SCOPES` を変更し、既存講師に再連携してもらう。
- `calendar.events` → `https://www.googleapis.com/auth/calendar.events.owned`(アプリが作成したイベントのみ)。同様に要検証。

狭いスコープにできれば審査が通りやすくなるので、実アカウントで確認できたら切り替えを推奨。

## 3. 審査フォームの回答文案

**App purpose (What does your app do?)**

> Lesson booking service for independent teachers (music, language, etc.). A teacher connects their Google Calendar so that students can see and book only the time slots in which the teacher is free, within the teacher's weekly business hours and up to 40 days ahead. Cancellations or changes within 14 days of a lesson require the student to submit a message and a choice (request approval / reschedule within two weeks / pay a cancellation fee), which the teacher approves or rejects in the app. Bookings are written to the teacher's chosen calendar.

**How will the data be used?**

> Busy time ranges are used only to exclude unavailable time from the booking page and are not stored. Events are created, updated and deleted only for bookings made through the app. Data is never sold, used for advertising, or shared with third parties except the infrastructure providers listed in our privacy policy. Teachers can disconnect at any time from the settings page, which revokes the token, and deleting the account removes all stored data.

**Limited Use disclosure**(プライバシーポリシーに掲載済み)

> Lesson Booking's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.

## 4. デモ動画の台本(2〜3 分、英語字幕か英語ナレーション推奨)

1. ブラウザのアドレスバーにドメインが見える状態で LP を表示
2. 講師として Google ログイン → 講師登録
3. 設定画面 →「Google と連携する」→ **OAuth 同意画面を表示し、要求スコープとクライアント ID が映るようにする**(審査で必須)
4. 同意後、連携カレンダーを追加(書き込み先・参照のみ)
5. Google カレンダー側に予定を1件入れ、予約ページでその時間帯が空き枠から消えることを見せる(calendar.readonly / freebusy の用途)
6. 生徒として予約 → 講師の Google カレンダーにイベントが作成されることを見せる(calendar.events の用途)
7. 予約を休講にする → イベントが削除されることを見せる
8. 設定画面で「連携を解除」→ トークンが失効すること、退会でデータが削除されることを説明

## 5. 提出後

- 審査担当からメールで追加質問が来る。英語で返信する(期限あり)。
- 審査中もテストユーザーでの利用は継続できる。
- スコープを変更したら再審査になる。

## 6. 関連する実装

- 同意画面の起点: `GET /hosts/{hostId}/google/connect`(`access_type=offline`, `prompt=consent`)
- トークン保存: `lb_host_google_credentials`(service role のみアクセス)
- 連携解除・退会時の失効: `GoogleCalendarClient.revoke`(Google の revoke エンドポイントを呼んだうえでローカルからも削除)

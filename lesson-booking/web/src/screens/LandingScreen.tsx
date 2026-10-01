import type { Rules } from '../api/types';
import { operator } from '../legal/operator';

/** 未ログインでトップを開いたときの LP */
export function LandingScreen({ rules, onLogin }: { rules: Rules; onLogin: () => void }) {
  const free = rules.plans.find((p) => p.plan === 'free')?.limits;
  const n = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? '無制限' : `${v}${unit}`);

  return (
    <div className="space-y-10 pb-4">
      <section className="text-center space-y-4 pt-6">
        <h1 className="text-2xl sm:text-3xl font-bold leading-snug">
          直前キャンセルに、
          <br className="sm:hidden" />
          ルールと承認を。
        </h1>
        <p className="text-stone-700 max-w-xl mx-auto">
          {operator.serviceName}は、個人レッスンの講師のための予約ページです。Google カレンダーの空き時間がそのまま予約枠になり、レッスン直前のキャンセルや日時変更は、生徒の申請を講師が承認する仕組みで管理できます。
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" className="btn-primary text-base px-5 py-2.5" onClick={onLogin}>無料で予約ページを作る</button>
          <a href="#how" className="btn-secondary text-base px-5 py-2.5">使い方を見る</a>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-3">
        <Feature title="カレンダーの空きが予約枠に">
          連携した Google カレンダーの予定を自動で避け、曜日ごとの受付時間から空き枠だけを表示します。何日先まで受け付けるかも講師が決められます(既定{rules.bookingHorizonDays}日)。複数のカレンダーを連携できます。
        </Feature>
        <Feature title="直前のキャンセルは承認制">
          レッスン開始の○日前(講師が設定。既定{rules.lateChangeThresholdDays}日)を過ぎたキャンセル・変更は、生徒がメッセージと対応方法を選んで申請。講師が承認するまで予約は有効なままです。
        </Feature>
        <Feature title="振替・キャンセルフィーも選択式">
          申請時に「承認を求める」「別日に振替(期間は講師が設定)」「キャンセルフィーを支払う」から選択。フィーはカード・振込・次回手渡しから支払い方法も選べます。振替先は空き枠から選ぶので、やり取りが一度で済みます。
        </Feature>
      </section>

      <section id="how" className="card space-y-3">
        <h2 className="text-lg font-semibold">はじめ方</h2>
        <ol className="space-y-2 text-sm">
          <Step n={1} title="Google でログインして講師登録">予約ページの URL 名を決めます(例: …/#/h/piano-suzuki)。</Step>
          <Step n={2} title="受付時間とカレンダーを設定">曜日ごとの受付時間を入れ、Google カレンダーを連携します。</Step>
          <Step n={3} title="URL を生徒に送る">生徒はリンクを開いて空き枠を選ぶだけ。予約・申請・承認結果はメールで届きます。</Step>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-center">料金</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card space-y-2">
            <div className="font-semibold">フリー</div>
            <div className="text-2xl font-bold">0円</div>
            <ul className="text-sm space-y-1 text-stone-700">
              <li>・予約 月{n(free?.maxBookingsPerMonth, '件')}まで</li>
              <li>・連携カレンダー {n(free?.maxCalendars, '件')}</li>
              <li>・直前キャンセルの承認フロー</li>
              <li>・通知メール</li>
            </ul>
          </div>
          <div className="card space-y-2 border-emerald-300">
            <div className="font-semibold text-emerald-800">プロ</div>
            {operator.proPrice ? <div className="text-2xl font-bold">{operator.proPrice}</div> : <div className="text-base font-semibold text-stone-600">月額制</div>}
            <ul className="text-sm space-y-1 text-stone-700">
              <li>・予約数 無制限</li>
              <li>・連携カレンダー 無制限</li>
              <li>・予約を Google カレンダーに自動登録</li>
              <li>・キャンセルフィーのカード決済(あなたの Stripe に直接入金)</li>
              <li>・フリーの機能すべて</li>
            </ul>
          </div>
        </div>
        <div className="card space-y-1">
          <div className="font-semibold">教室プラン</div>
          <div className="text-sm text-stone-700">
            複数の講師がいる教室向け。講師を招待してまとめて契約でき、所属講師全員がプロの機能を使えます。教室ページから各講師の予約ページへ案内できます。
          </div>
          <div className="text-sm font-medium">{operator.orgSeatPrice ?? '講師の人数に応じた月額制'}</div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">よくある質問</h2>
        <Faq q="生徒もアカウントが必要ですか?">空き枠の閲覧はログイン不要です。予約するときに Google アカウントでログインします。</Faq>
        <Faq q="キャンセルフィーの支払いもできますか?">
          生徒は申請時に「クレジットカード」「銀行振込」「次回レッスン時に手渡し」から支払い方法を選び、講師がキャンセルと一緒に承認します。カード決済はプロプランで講師の Stripe アカウントを連携したときに使え、売上は講師の口座に直接入ります(運営者は預かりません)。振込・手渡しは講師が「入金確認」で記録します。
        </Faq>
        <Faq q="カレンダーの予定の中身は見られますか?">
          見ません。空き枠の計算に「予定がある時間帯」だけを使い、件名や内容は取得しません。
        </Faq>
        <Faq q="教室の管理者は、ほかの講師の予約を見られますか?">
          見られません。予約や生徒の情報は講師ごとに独立しています。管理者ができるのは、講師の招待・解除と教室プランの契約管理です。
        </Faq>
        <Faq q="途中でやめられますか?">
          プロプランはいつでも解約できます。退会すると登録情報と予約情報は削除され、今後の予約は生徒に通知したうえで取り消されます。
        </Faq>
      </section>

      <section className="text-center space-y-3">
        <button type="button" className="btn-primary text-base px-5 py-2.5" onClick={onLogin}>無料で予約ページを作る</button>
        <p className="text-sm text-stone-600">
          生徒の方は、講師から届いた予約ページのリンクを開いてください。
          <button type="button" className="underline ml-1" onClick={onLogin}>マイ予約へログイン</button>
        </p>
      </section>
    </div>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-1">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-stone-700">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-none w-7 h-7 rounded-full bg-emerald-700 text-white text-sm flex items-center justify-center">{n}</span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-stone-600">{children}</div>
      </div>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="border-b border-stone-100 pb-2">
      <summary className="cursor-pointer text-sm font-medium">{q}</summary>
      <p className="text-sm text-stone-700 mt-1">{children}</p>
    </details>
  );
}

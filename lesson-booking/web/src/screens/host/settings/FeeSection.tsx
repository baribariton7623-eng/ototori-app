import { useState } from 'react';
import { api } from '../../../api/client';
import type { ConnectStatus, FeeMethod, Host, Rules } from '../../../api/types';
import { Badge, Notice, Spinner } from '../../../components/ui';

/** キャンセルフィー(金額・受け付ける支払い方法・振込先・Stripe 連携) */
export function FeeSection({
  host,
  rules,
  connect,
  returnUrl,
  onHostUpdated,
  reload,
  run,
  onError,
}: {
  host: Host;
  rules: Rules;
  connect: ConnectStatus | null;
  returnUrl: string;
  onHostUpdated: (h: Host) => void;
  reload: () => void;
  run: (p: Promise<unknown>) => void;
  onError: (e: unknown) => void;
}) {
  const [feeInput, setFeeInput] = useState<string>(host.cancellationFeeAmount != null ? String(host.cancellationFeeAmount) : '');
  const [feeSaved, setFeeSaved] = useState(false);
  const [feeMethods, setFeeMethods] = useState<FeeMethod[]>(host.feeMethods);
  const [bankInfo, setBankInfo] = useState(host.bankTransferInfo);
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">キャンセルフィー</h2>
      <p className="text-xs text-stone-600">
        生徒が直前のキャンセル申請で「キャンセルフィーを支払う」を選び、あなたが承認したときの金額です。承認した時点の金額が請求されます。空欄にすると金額は表示せず、支払いは個別にやり取りします。
      </p>
      <div>
        <label className="label" htmlFor="fee-amount">金額(円)</label>
        <input id="fee-amount" className="input" type="number" min={50} step={100} value={feeInput} onChange={(e) => setFeeInput(e.target.value)} placeholder="例: 3000" />
      </div>
      <fieldset>
        <legend className="label">受け付ける支払い方法(生徒が申請時に選び、あなたが承認します)</legend>
        <div className="space-y-1">
          {rules.feeMethods.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={feeMethods.includes(m.value)}
                onChange={(e) => setFeeMethods(e.target.checked ? [...feeMethods, m.value] : feeMethods.filter((x) => x !== m.value))}
              />
              {m.label}
              {m.value === 'card' && !connect?.active && <span className="text-xs text-stone-500">(下の Stripe 連携が完了すると選べるようになります)</span>}
              {m.value === 'bank_transfer' && !bankInfo.trim() && <span className="text-xs text-stone-500">(振込先の入力が必要です)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {feeMethods.includes('bank_transfer') && (
        <div>
          <label className="label" htmlFor="bank-info">振込先(承認後、その生徒にだけ表示されます)</label>
          <textarea
            id="bank-info"
            className="input min-h-16"
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            placeholder={'例: ○○銀行 △△支店 普通 1234567\n名義: スズキ ハナコ'}
          />
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            api
              .updateHost(host.id, {
                cancellationFeeAmount: feeInput.trim() === '' ? null : Number(feeInput),
                feeMethods,
                bankTransferInfo: bankInfo,
              })
              .then((h) => {
                onHostUpdated(h);
                setFeeSaved(true);
                setTimeout(() => setFeeSaved(false), 1500);
                reload();
              })
              .catch(onError)
          }
        >
          {feeSaved ? '保存しました' : '保存'}
        </button>
      </div>
      <div className="border-t border-stone-100 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">オンライン決済(Stripe)</span>
          {connect?.active ? <Badge tone="green">受付中</Badge> : connect?.accountId ? <Badge tone="amber">手続き未完了</Badge> : <Badge>未連携</Badge>}
        </div>
        {connect === null ? (
          <Spinner />
        ) : !connect.available ? (
          <Notice>プロプランでは、あなたの Stripe アカウントを連携して、生徒にカードでキャンセルフィーを払ってもらえます。売上はあなたの口座に直接入金されます。</Notice>
        ) : connect.active ? (
          <div className="flex items-center justify-between gap-2 text-xs text-stone-600">
            <span>承認後、生徒のマイ予約に「カードで支払う」ボタンが表示されます。売上はあなたの Stripe アカウントに入り、Stripe の決済手数料がかかります。</span>
            <button type="button" className="text-red-700 underline whitespace-nowrap" onClick={() => run(api.connectDisconnect(host.id))}>連携を外す</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-stone-600">
              あなた名義の Stripe アカウントを作成(または既存のアカウントでログイン)し、本人確認と入金口座を登録します。運営者は売上を預からず、手数料も取りません。
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                api
                  .connectOnboarding(host.id, returnUrl, returnUrl)
                  .then(({ url }) => {
                    window.location.href = url;
                  })
                  .catch(onError)
              }
            >
              {connect.accountId ? 'Stripe の手続きを続ける' : 'Stripe と連携する'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

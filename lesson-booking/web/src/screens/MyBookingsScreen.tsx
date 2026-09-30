import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ChangeOutcome, ChangeRequest, Rules, StudentBooking } from '../api/types';
import { ChangeDialog } from '../components/ChangeDialog';
import { DeleteAccount } from '../components/DeleteAccount';
import { Badge, ErrorBanner, Notice, Spinner } from '../components/ui';
import { fmtFull, fmtRange, yen } from '../lib/format';

type Detail = StudentBooking & { changeRequests: ChangeRequest[] };

const STATUS_JA: Record<ChangeRequest['status'], string> = { pending: '承認待ち', approved: '承認', rejected: '却下' };
const KIND_JA: Record<ChangeRequest['kind'], string> = { cancel: 'キャンセル', reschedule: '日時変更' };

/** 生徒: 自分の予約一覧・キャンセル/変更・申請履歴 */
export function MyBookingsScreen({
  rules,
  refreshKey,
  email,
  onDeleted,
}: {
  rules: Rules;
  refreshKey: number;
  email: string;
  onDeleted: () => void;
}) {
  const [list, setList] = useState<StudentBooking[] | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [target, setTarget] = useState<StudentBooking | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await api.myBookings();
      setList(l);
      const entries = await Promise.all(l.map(async (b) => [b.id, await api.booking(b.id)] as const));
      setDetails(Object.fromEntries(entries));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function onDone(outcome: ChangeOutcome) {
    setTarget(null);
    setFlash(
      outcome.type === 'applied'
        ? outcome.booking.status === 'cancelled'
          ? 'キャンセルしました。'
          : `日時を変更しました: ${fmtRange(outcome.booking.startAt, outcome.booking.endAt)}`
        : '申請を送信しました。主催者の承認をお待ちください。承認までは元の予約が維持されます。',
    );
    void load();
  }

  if (list === null) return <Spinner />;

  const now = Date.now();
  const upcoming = list.filter((b) => b.status === 'confirmed' && new Date(b.endAt).getTime() > now);
  const past = list.filter((b) => !upcoming.includes(b));

  return (
    <div className="space-y-4">
      {flash && (
        <Notice tone="success">
          {flash}
          <button type="button" className="ml-2 underline text-xs" onClick={() => setFlash(null)}>閉じる</button>
        </Notice>
      )}
      <ErrorBanner error={error} onClose={() => setError(null)} />

      <section className="space-y-2">
        <h2 className="font-semibold">今後の予約</h2>
        {upcoming.length === 0 && <div className="text-sm text-stone-500">予約はありません。</div>}
        {upcoming.map((b) => {
          const d = details[b.id];
          const pending = d?.changeRequests.find((r) => r.status === 'pending');
          return (
            <div key={b.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{fmtRange(b.startAt, b.endAt)}</div>
                  {b.note && <div className="text-xs text-stone-500 mt-0.5">備考: {b.note}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {pending ? <Badge tone="amber">承認待ち</Badge> : <Badge tone="green">確定</Badge>}
                  {b.requiresApprovalToChange && !pending && <Badge tone="neutral">変更は承認制</Badge>}
                </div>
              </div>
              {b.requiresApprovalToChange && !pending && (
                <div className="text-xs text-amber-800">
                  開始まで{rules.lateChangeThresholdDays}日未満のため、キャンセル・変更には主催者の承認が必要です。
                </div>
              )}
              {pending && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 space-y-0.5">
                  <div>
                    {KIND_JA[pending.kind]}を申請中 — {rules.lateChangeOptions.find((o) => o.value === pending.option)?.label}
                    {pending.feeMethod && `(${rules.feeMethods.find((m) => m.value === pending.feeMethod)?.label})`}
                  </div>
                  {pending.proposedStartAt && <div>振替希望: {fmtFull(pending.proposedStartAt)}</div>}
                  <div className="text-stone-600">「{pending.message}」</div>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" className="btn-secondary" disabled={!!pending} onClick={() => setTarget(b)}>
                  キャンセル・変更
                </button>
              </div>
              <History requests={d?.changeRequests.filter((r) => r.status !== 'pending') ?? []} rules={rules} />
            </div>
          );
        })}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-600">過去・キャンセル済み</h2>
          {past.map((b) => (
            <div key={b.id} className="card space-y-1 opacity-80">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">{fmtRange(b.startAt, b.endAt)}</div>
                <div className="flex gap-1">
                  {b.status === 'cancelled' ? <Badge tone="red">キャンセル</Badge> : <Badge>終了</Badge>}
                  {b.cancellationFeeStatus === 'pending' && <Badge tone="amber">フィー未払い</Badge>}
                  {b.cancellationFeeStatus === 'paid' && <Badge tone="green">フィー支払済</Badge>}
                </div>
              </div>
              {b.cancellationFeeStatus === 'pending' && (
                <div className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                  <div className="space-y-1">
                    <div>
                      キャンセルフィー{b.cancellationFeeAmount != null ? ` ${yen(b.cancellationFeeAmount)}` : ''}
                      {b.cancellationFeeMethod && ` — ${rules.feeMethods.find((m) => m.value === b.cancellationFeeMethod)?.label}`}
                    </div>
                    {b.cancellationFeeMethod === 'bank_transfer' && b.bankTransferInfo && (
                      <div>
                        <div className="font-medium">振込先</div>
                        <pre className="whitespace-pre-wrap font-sans">{b.bankTransferInfo}</pre>
                      </div>
                    )}
                    {b.cancellationFeeMethod === 'in_person' && <div>次回のレッスン時に講師へお支払いください。</div>}
                    {b.cancellationFeeMethod === 'card' && !b.feePayableOnline && <div>現在カード決済を受け付けていません。講師の案内に従ってください。</div>}
                    {!b.cancellationFeeMethod && <div>お支払い方法は講師の案内に従ってください。</div>}
                  </div>
                  {b.feePayableOnline && (
                    <button
                      type="button"
                      className="btn-primary py-1 text-xs"
                      onClick={() => {
                        const back = `${window.location.origin}/#/mine`;
                        api
                          .feeCheckout(b.id, back, back)
                          .then(({ url }) => {
                            window.location.href = url;
                          })
                          .catch(setError);
                      }}
                    >
                      カードで支払う
                    </button>
                  )}
                </div>
              )}
              <History requests={details[b.id]?.changeRequests ?? []} rules={rules} />
            </div>
          ))}
        </section>
      )}

      <DeleteAccount
        confirmText={email}
        confirmLabel="メールアドレス"
        description={[
          '予約履歴・申請履歴を含むすべての情報が削除されます。',
          '今後の予約が残っている場合は退会できません。先にキャンセルしてください(開始2週間前を過ぎた予約は講師の承認が必要です)。',
        ]}
        onDeleted={onDeleted}
      />

      {target && <ChangeDialog booking={target} rules={rules} onClose={() => setTarget(null)} onDone={onDone} />}
    </div>
  );
}

function History({ requests, rules }: { requests: ChangeRequest[]; rules: Rules }) {
  if (requests.length === 0) return null;
  return (
    <details className="text-xs text-stone-600">
      <summary className="cursor-pointer">申請履歴({requests.length})</summary>
      <ul className="mt-1 space-y-1">
        {requests.map((r) => (
          <li key={r.id} className="rounded bg-stone-50 p-2">
            <div>
              {fmtFull(r.createdAt)} {KIND_JA[r.kind]} / {rules.lateChangeOptions.find((o) => o.value === r.option)?.label} → <b>{STATUS_JA[r.status]}</b>
            </div>
            <div>「{r.message}」</div>
            {r.feeMethod && <div>支払い方法: {rules.feeMethods.find((m) => m.value === r.feeMethod)?.label}</div>}
            {r.decisionNote && <div className="text-stone-500">主催者: {r.decisionNote}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

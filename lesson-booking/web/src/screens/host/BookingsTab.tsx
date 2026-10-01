import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { FeeMethod, Host, HostBooking, Rules } from '../../api/types';
import { Badge, ErrorBanner, Modal, Notice, Spinner } from '../../components/ui';
import { fmtRange, yen } from '../../lib/format';

// ---------- 予約一覧 ----------

export function BookingsTab({ host, rules }: { host: Host; rules: Rules }) {
  const [list, setList] = useState<HostBooking[] | null>(null);
  const [methods, setMethods] = useState<FeeMethod[]>([]);

  useEffect(() => {
    api.hostPublic(host.id).then((p) => setMethods(p.feeMethods)).catch(() => setMethods([]));
  }, [host.id]);
  const methodLabel = (m: FeeMethod) => rules.feeMethods.find((x) => x.value === m)?.label ?? m;
  const [error, setError] = useState<unknown>(null);
  const [cancelTarget, setCancelTarget] = useState<HostBooking | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);

  async function submitCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api.cancelByHost(host.id, cancelTarget.id, reason.trim());
      setCancelTarget(null);
      setReason('');
      await load();
    } catch (e) {
      setCancelError(e);
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(() => api.hostBookings(host.id).then(setList).catch(setError), [host.id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (list === null) return <Spinner />;
  const now = Date.now();
  const upcoming = list.filter((b) => b.status === 'confirmed' && new Date(b.endAt).getTime() > now);
  const others = list.filter((b) => !upcoming.includes(b)).reverse();

  return (
    <div className="space-y-3">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <h2 className="font-semibold">今後の予約({upcoming.length})</h2>
      {upcoming.length === 0 && <div className="text-sm text-stone-500">予約はありません。</div>}
      {upcoming.map((b) => (
        <div key={b.id} className="card flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">{fmtRange(b.startAt, b.endAt)}</div>
            <div className="text-sm text-stone-600">{b.student?.name || '(名前なし)'} <span className="text-xs">{b.student?.email}</span></div>
            {b.note && <div className="text-xs text-stone-500">備考: {b.note}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone="green">確定</Badge>
            <button type="button" className="text-xs text-red-700 underline" onClick={() => setCancelTarget(b)}>休講にする</button>
          </div>
        </div>
      ))}
      {cancelTarget && (
        <Modal title="休講にする" onClose={() => setCancelTarget(null)}>
          <div className="space-y-3">
            <div className="text-sm">
              <div className="text-xs text-stone-500">対象</div>
              <div className="font-medium">{fmtRange(cancelTarget.startAt, cancelTarget.endAt)}</div>
              <div className="text-stone-600">{cancelTarget.student?.name || cancelTarget.student?.email}</div>
            </div>
            <Notice tone="warn">予約を取り消し、生徒にメールで知らせます。Google カレンダーのイベントも削除されます。</Notice>
            <div>
              <label className="label" htmlFor="cancel-reason">生徒へのメッセージ(必須)</label>
              <textarea
                id="cancel-reason"
                className="input min-h-24"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例: 体調不良のため休講とさせてください。振替は予約ページからお選びください。"
              />
            </div>
            <ErrorBanner error={cancelError} onClose={() => setCancelError(null)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>戻る</button>
              <button type="button" className="btn-danger" disabled={busy || !reason.trim()} onClick={submitCancel}>
                {busy ? '処理中…' : '休講にする'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {others.length > 0 && (
        <>
          <h2 className="font-semibold text-stone-600 pt-2">過去・キャンセル</h2>
          {others.map((b) => (
            <div key={b.id} className="card flex items-start justify-between gap-2 opacity-80">
              <div>
                <div className="text-sm">{fmtRange(b.startAt, b.endAt)}</div>
                <div className="text-xs text-stone-600">{b.student?.name || b.student?.email}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {b.status === 'cancelled' ? <Badge tone="red">キャンセル</Badge> : <Badge>終了</Badge>}
                {b.cancellationFeeStatus === 'pending' && (
                  <span className="text-xs text-amber-800">
                    フィー{b.cancellationFeeAmount != null ? ` ${yen(b.cancellationFeeAmount)}` : ''} 未払い
                  </span>
                )}
                {b.cancellationFeeStatus === 'pending' && (
                  <label className="text-xs text-stone-600 flex items-center gap-1">
                    支払い方法
                    <select
                      className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs"
                      value={b.cancellationFeeMethod ?? ''}
                      aria-label="支払い方法を変更"
                      onChange={(e) => api.changeFeeMethod(host.id, b.id, e.target.value as FeeMethod).then(load).catch(setError)}
                    >
                      {!b.cancellationFeeMethod && <option value="">未指定</option>}
                      {[...new Set([...(b.cancellationFeeMethod ? [b.cancellationFeeMethod] : []), ...methods])].map((m) => (
                        <option key={m} value={m}>{methodLabel(m)}</option>
                      ))}
                    </select>
                  </label>
                )}
                {b.cancellationFeeStatus === 'pending' && (
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    onClick={() => api.markFeePaid(host.id, b.id).then(load).catch(setError)}
                  >
                    フィー入金を確認
                  </button>
                )}
                {b.cancellationFeeStatus === 'paid' && <Badge tone="green">フィー支払済</Badge>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

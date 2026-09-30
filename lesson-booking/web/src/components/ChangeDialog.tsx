import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ChangeKind, ChangeOutcome, LateChangeOption, Rules, Slot, StudentBooking } from '../api/types';
import { addDays, fmtRange } from '../lib/format';
import { SlotPicker } from './SlotPicker';
import { ErrorBanner, Modal, Notice } from './ui';

interface Props {
  booking: StudentBooking;
  rules: Rules;
  onClose: () => void;
  onDone: (outcome: ChangeOutcome) => void;
}

/**
 * キャンセル・変更ダイアログ。
 * requiresApprovalToChange が true(開始まで 14 日未満)のときはメッセージ+対応方法(3 択)を必須にし、承認待ちとして送る。
 */
export function ChangeDialog({ booking, rules, onClose, onDone }: Props) {
  const late = booking.requiresApprovalToChange;
  const [kind, setKind] = useState<ChangeKind>('cancel');
  const [option, setOption] = useState<LateChangeOption | ''>('');
  const [message, setMessage] = useState('');
  const [proposed, setProposed] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // 振替を選ぶと自動で kind=reschedule に
  useEffect(() => {
    if (option === 'reschedule_within_two_weeks') setKind('reschedule');
  }, [option]);

  const needsSlot = kind === 'reschedule';

  // 振替候補: 元の日の前後 rescheduleRangeDays 日(直前時)/ 受付ウィンドウ全体(猶予あり)
  useEffect(() => {
    if (!needsSlot) return;
    let cancelled = false;
    const origin = new Date(booking.startAt);
    const from = late ? addDays(origin, -rules.rescheduleRangeDays) : undefined;
    const to = late ? addDays(origin, rules.rescheduleRangeDays) : undefined;
    api
      .slots(booking.hostId, from, to)
      .then((r) => {
        if (!cancelled) setSlots(r.slots.filter((s) => s.startAt !== booking.startAt));
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [needsSlot, late, booking.hostId, booking.startAt, rules.rescheduleRangeDays]);

  const canSubmit =
    !busy &&
    (!needsSlot || proposed !== null) &&
    (!late || (message.trim().length > 0 && option !== ''));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.change(booking.id, {
        kind,
        message: late ? message.trim() : undefined,
        option: late && option ? option : undefined,
        proposedStartAt: needsSlot && proposed ? proposed : undefined,
      });
      onDone(outcome);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={late ? 'キャンセル・変更の申請' : 'キャンセル・変更'} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm">
          <div className="text-stone-500 text-xs">対象のレッスン</div>
          <div className="font-medium">{fmtRange(booking.startAt, booking.endAt)}</div>
        </div>

        {late ? (
          <Notice tone="warn">
            開始まで{rules.lateChangeThresholdDays}日未満のため、主催者の承認が必要です。事情と対応方法を入力してください。承認されるまで予約はそのまま維持されます。
          </Notice>
        ) : (
          <Notice>開始まで{rules.lateChangeThresholdDays}日以上あるため、すぐに反映されます。</Notice>
        )}

        <fieldset>
          <legend className="label">操作</legend>
          <div className="flex gap-2">
            <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === 'cancel' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}>
              <input type="radio" className="mr-2" checked={kind === 'cancel'} onChange={() => setKind('cancel')} disabled={option === 'reschedule_within_two_weeks'} />
              キャンセル
            </label>
            <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === 'reschedule' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}>
              <input type="radio" className="mr-2" checked={kind === 'reschedule'} onChange={() => setKind('reschedule')} />
              日時を変更
            </label>
          </div>
        </fieldset>

        {late && (
          <>
            <fieldset>
              <legend className="label">対応方法(必須)</legend>
              <div className="space-y-1.5">
                {rules.lateChangeOptions.map((o) => (
                  <label key={o.value} className={`flex items-start gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm ${option === o.value ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}>
                    <input type="radio" name="option" className="mt-0.5" checked={option === o.value} onChange={() => setOption(o.value)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="change-message">
                主催者へのメッセージ(必須)
              </label>
              <textarea
                id="change-message"
                className="input min-h-24"
                placeholder="例: 急な出張が入ってしまいました。ご迷惑をおかけしますが、ご検討をお願いします。"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </>
        )}

        {needsSlot && (
          <div>
            <div className="label">
              振替先の日時{late ? `(元の日から前後${rules.rescheduleRangeDays}日以内)` : ''}
            </div>
            {slots === null ? (
              <div className="text-sm text-stone-500">空き枠を取得中…</div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 p-2">
                <SlotPicker slots={slots} selected={proposed} onSelect={setProposed} />
              </div>
            )}
          </div>
        )}

        <ErrorBanner error={error} onClose={() => setError(null)} />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            戻る
          </button>
          <button type="button" className={kind === 'cancel' ? 'btn-danger' : 'btn-primary'} disabled={!canSubmit} onClick={submit}>
            {busy ? '送信中…' : late ? '申請する' : kind === 'cancel' ? 'キャンセルする' : '変更する'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

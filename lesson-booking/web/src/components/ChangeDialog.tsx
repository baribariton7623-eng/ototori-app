import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/client';
import type { ChangeKind, ChangeOutcome, FeeMethod, LateChangeOption, PublicHost, Rules, Slot, StudentBooking } from '../api/types';
import { addDays, daysLabel, fmtFull, fmtRange, lateChangeOptionLabel, yen } from '../lib/format';
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
  /** 振替の希望日時(第1希望から順)。猶予ありの即時変更では 1 つだけ */
  const [proposed, setProposed] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState<PublicHost | null>(null);
  const [feeMethod, setFeeMethod] = useState<FeeMethod | ''>('');
  /** 一覧を取り直したときに埋まっていて選択から外した希望の通知 */
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  /** 講師の振替期間(元の日から前後の日数) */
  const rangeDays = host?.rescheduleRangeDays ?? booking.rescheduleRangeDays ?? rules.rescheduleRangeDays;

  useEffect(() => {
    api.hostPublic(booking.hostId).then(setHost).catch(() => setHost(null));
  }, [booking.hostId]);

  // 振替を選ぶと日時変更、キャンセルフィーを選ぶとキャンセルに固定
  useEffect(() => {
    if (option === 'reschedule_within_two_weeks') setKind('reschedule');
    if (option === 'pay_cancellation_fee') setKind('cancel');
    if (option !== 'pay_cancellation_fee') setFeeMethod('');
  }, [option]);

  const payingFee = late && option === 'pay_cancellation_fee';
  const selectableMethods = host?.feeMethods ?? [];
  const methodLabel = (m: FeeMethod) => rules.feeMethods.find((x) => x.value === m)?.label ?? m;

  const needsSlot = kind === 'reschedule';
  const maxCandidates = late ? 3 : 1;

  function toggleCandidate(startAt: string) {
    setProposed((cur) => {
      if (cur.includes(startAt)) return cur.filter((x) => x !== startAt);
      if (maxCandidates === 1) return [startAt];
      if (cur.length >= maxCandidates) return cur; // 上限。先にどれかを外してもらう
      return [...cur, startAt];
    });
  }
  function moveUp(i: number) {
    setProposed((cur) => {
      if (i <= 0) return cur;
      const next = [...cur];
      [next[i - 1], next[i]] = [next[i] as string, next[i - 1] as string];
      return next;
    });
  }

  // 振替候補: 元の日の前後 rangeDays 日(直前時)/ 受付ウィンドウ全体(猶予あり)。
  // 予約できる枠だけを表示し、開いている間も定期的に取り直して、埋まった枠は一覧と選択から外す
  const proposedRef = useRef<string[]>([]);
  proposedRef.current = proposed;
  const fetchSlots = useCallback(async () => {
    const origin = new Date(booking.startAt);
    const from = late ? addDays(origin, -rangeDays) : undefined;
    const to = late ? addDays(origin, rangeDays) : undefined;
    const r = await api.rescheduleSlots(booking.id, from, to);
    const available = r.slots.filter((s) => s.startAt !== booking.startAt);
    setSlots(available);
    const open = new Set(available.map((s) => s.startAt));
    const gone = proposedRef.current.filter((p) => !open.has(p));
    if (gone.length > 0) {
      setProposed((cur) => cur.filter((p) => open.has(p)));
      setRemovedNotice(`${gone.map((g) => fmtFull(g)).join('、')} は予約できなくなったため、希望から外しました。`);
    }
  }, [booking.id, booking.startAt, late, rangeDays]);

  useEffect(() => {
    if (!needsSlot) return;
    let active = true;
    const run = () => {
      if (active) fetchSlots().catch((e) => active && setError(e));
    };
    run();
    const timer = window.setInterval(run, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && run();
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [needsSlot, fetchSlots]);

  const canSubmit =
    !busy &&
    (!needsSlot || proposed.length > 0) &&
    (!late || (message.trim().length > 0 && option !== '')) &&
    (!payingFee || feeMethod !== '');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.change(booking.id, {
        kind,
        message: late ? message.trim() : undefined,
        option: late && option ? option : undefined,
        proposedStartAts: needsSlot && proposed.length > 0 ? proposed : undefined,
        feeMethod: payingFee && feeMethod ? feeMethod : undefined,
      });
      onDone(outcome);
    } catch (e) {
      setError(e);
      // 申請までの間に埋まった枠があれば、一覧を取り直して選択から外す
      if (e instanceof ApiError && e.code === 'slot_unavailable' && needsSlot) {
        await fetchSlots().catch(() => {});
      }
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
            開始まで{daysLabel(booking.lateChangeThresholdDays)}未満のため、主催者の承認が必要です。事情と対応方法を入力してください。承認されるまで予約はそのまま維持されます。
          </Notice>
        ) : (
          <Notice>
            {booking.lateChangeThresholdDays > 0
              ? `開始まで${daysLabel(booking.lateChangeThresholdDays)}以上あるため、すぐに反映されます。`
              : 'この講師のレッスンは、開始前ならすぐに反映されます。'}
          </Notice>
        )}

        <fieldset>
          <legend className="label">操作</legend>
          <div className="flex gap-2">
            <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === 'cancel' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}>
              <input type="radio" className="mr-2" checked={kind === 'cancel'} onChange={() => setKind('cancel')} disabled={option === 'reschedule_within_two_weeks'} />
              キャンセル
            </label>
            <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === 'reschedule' ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}>
              <input type="radio" className="mr-2" checked={kind === 'reschedule'} onChange={() => setKind('reschedule')} disabled={option === 'pay_cancellation_fee'} />
              日時を変更
            </label>
          </div>
        </fieldset>

        {late && (
          <>
            <fieldset>
              <legend className="label">対応方法(必須)</legend>
              <div className="space-y-1.5">
                {rules.lateChangeOptions.map((o) => {
                  const unavailable = o.value === 'pay_cancellation_fee' && host !== null && selectableMethods.length === 0;
                  return (
                    <label
                      key={o.value}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${unavailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${option === o.value ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}
                    >
                      <input type="radio" name="option" className="mt-0.5" checked={option === o.value} disabled={unavailable} onChange={() => setOption(o.value)} />
                      <span>
                        {lateChangeOptionLabel(o.value, rangeDays)}
                        {o.value === 'pay_cancellation_fee' && host?.cancellationFeeAmount != null && (
                          <span className="ml-1 font-medium">({yen(host.cancellationFeeAmount)})</span>
                        )}
                        {unavailable && <span className="block text-xs text-stone-500">この講師はキャンセルフィーの支払い方法を設定していません</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {payingFee && (
              <fieldset>
                <legend className="label">支払い方法(必須・講師の承認が必要です)</legend>
                <div className="flex flex-col sm:flex-row gap-1.5">
                  {selectableMethods.map((m) => (
                    <label
                      key={m}
                      className={`flex-1 flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm ${feeMethod === m ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}
                    >
                      <input type="radio" name="feeMethod" checked={feeMethod === m} onChange={() => setFeeMethod(m)} />
                      {methodLabel(m)}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  承認されると、{feeMethod === 'card' ? 'マイ予約からカードで支払えます' : feeMethod === 'bank_transfer' ? '振込先がメールとマイ予約に表示されます' : feeMethod === 'in_person' ? '次回のレッスン時に講師へお支払いください' : '支払い方法ごとの案内が届きます'}。
                </p>
              </fieldset>
            )}
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
          <div className="space-y-2">
            <div className="label">
              {late
                ? `振替の希望日時(第1〜第${maxCandidates}希望まで・元の日から前後${rangeDays}日以内)`
                : '変更先の日時'}
            </div>
            {late && (
              <p className="text-xs text-stone-600">
                希望順に選んでください(1つでも可)。講師が候補の中から1つを選んで承認します。候補の枠は確保されないため、承認までに埋まることがあります。
              </p>
            )}
            {late && proposed.length > 0 && (
              <ol className="space-y-1" aria-label="選択中の希望日時">
                {proposed.map((p, i) => (
                  <li key={p} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-sm">
                    <span>
                      <span className="inline-block w-14 text-xs font-medium text-emerald-800">第{i + 1}希望</span>
                      {fmtFull(p)}
                    </span>
                    <span className="flex gap-2 text-xs">
                      {i > 0 && (
                        <button type="button" className="underline text-stone-600" onClick={() => moveUp(i)} aria-label={`第${i + 1}希望を1つ上げる`}>
                          ↑上げる
                        </button>
                      )}
                      <button type="button" className="underline text-red-700" onClick={() => toggleCandidate(p)} aria-label={`第${i + 1}希望を外す`}>
                        外す
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {removedNotice && (
              <p className="text-xs text-amber-800" role="status">
                {removedNotice}
                <button type="button" className="ml-1 underline" onClick={() => setRemovedNotice(null)}>閉じる</button>
              </p>
            )}
            {late && proposed.length >= maxCandidates && (
              <p className="text-xs text-amber-800">第{maxCandidates}希望まで選びました。変えるときは「外す」を押してください。</p>
            )}
            {slots === null ? (
              <div className="text-sm text-stone-500">空き枠を取得中…</div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 p-2 pt-3" aria-label="予約できる日時">
                <SlotPicker slots={slots} selected={late ? proposed : (proposed[0] ?? null)} onSelect={toggleCandidate} />
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

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Host, HostChangeRequest, Rules } from '../../api/types';
import { Badge, ErrorBanner, Notice, Spinner } from '../../components/ui';
import { fmtFull, fmtRange } from '../../lib/format';

// ---------- 承認待ち ----------

export function RequestsTab({ host, rules }: { host: Host; rules: Rules }) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [list, setList] = useState<HostChangeRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** 振替の承認で選んだ候補(申請ごと) */
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setList(null);
    api.changeRequests(host.id, filter).then(setList).catch(setError);
  }, [host.id, filter]);

  useEffect(() => {
    load();
  }, [load]);

  /** 選んだ候補。未選択なら空いている最上位の希望 */
  function chosenFor(r: HostChangeRequest): string | null {
    const picked = choice[r.id];
    if (picked && r.candidates.some((c) => c.startAt === picked && c.available)) return picked;
    return r.candidates.find((c) => c.available)?.startAt ?? null;
  }

  async function decide(r: HostChangeRequest, decision: 'approve' | 'reject') {
    setBusyId(r.id);
    setError(null);
    try {
      const startAt = decision === 'approve' && r.kind === 'reschedule' ? chosenFor(r) : undefined;
      await api.decide(host.id, r.id, decision, notes[r.id], startAt ?? undefined);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">変更・キャンセルの申請</h2>
        <select className="input w-auto py-1" value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')} aria-label="表示する申請">
          <option value="pending">承認待ちのみ</option>
          <option value="all">すべて</option>
        </select>
      </div>
      <Notice>
        開始まで{host.lateChangeThresholdDays}日未満の申請です(設定で変更できます)。承認すると予約がキャンセルまたは振替され、Google カレンダーにも反映されます。却下すると元の予約が維持されます。
      </Notice>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {list === null && <Spinner />}
      {list?.length === 0 && <div className="text-sm text-stone-500">申請はありません。</div>}
      {list?.map((r) => (
        <div key={r.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-stone-500">{r.student?.name || r.student?.email} · {fmtFull(r.createdAt)} 申請</div>
              <div className="font-medium">
                {r.kind === 'cancel' ? 'キャンセル' : '日時変更'}: {r.booking ? fmtRange(r.booking.startAt, r.booking.endAt) : '(予約なし)'}
              </div>
              {r.status !== 'pending' && r.approvedStartAt && <div className="text-sm">→ 振替先 <b>{fmtFull(r.approvedStartAt)}</b></div>}
            </div>
            <Badge tone={r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'green' : 'red'}>
              {r.status === 'pending' ? '承認待ち' : r.status === 'approved' ? '承認済み' : '却下'}
            </Badge>
          </div>
          <div className="text-sm">
            <Badge>{r.optionLabel}</Badge>
            {r.feeMethodLabel && <span className="ml-1"><Badge tone="amber">支払い方法: {r.feeMethodLabel}</Badge></span>}
            <p className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2">{r.message}</p>
          </div>
          {r.status === 'pending' && r.kind === 'reschedule' && r.candidates.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="label">振替先を選んで承認(生徒の希望順)</legend>
              {r.candidates.map((c, i) => (
                <label
                  key={c.startAt}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${c.available ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${chosenFor(r) === c.startAt ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}
                >
                  <input
                    type="radio"
                    name={`choice-${r.id}`}
                    disabled={!c.available}
                    checked={chosenFor(r) === c.startAt}
                    onChange={() => setChoice({ ...choice, [r.id]: c.startAt })}
                  />
                  <span className="w-14 text-xs font-medium text-stone-600">第{i + 1}希望</span>
                  <span className="flex-1">{fmtFull(c.startAt)}</span>
                  {!c.available && <span className="text-xs text-red-700">埋まっています</span>}
                </label>
              ))}
              {!r.candidates.some((c) => c.available) && (
                <p className="text-xs text-red-700">希望日時はすべて埋まっています。却下して、別の日時で申請し直すよう伝えてください。</p>
              )}
            </fieldset>
          )}
          {r.status === 'pending' ? (
            <div className="space-y-2">
              <input
                className="input"
                placeholder="生徒への返信メモ(任意)"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-danger" disabled={busyId === r.id} onClick={() => decide(r, 'reject')}>却下</button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === r.id || (r.kind === 'reschedule' && chosenFor(r) === null)}
                  onClick={() => decide(r, 'approve')}
                >
                  {r.kind === 'cancel'
                    ? r.feeMethodLabel
                      ? `キャンセルと${r.feeMethodLabel}を承認`
                      : 'キャンセルを承認'
                    : `第${r.candidates.findIndex((c) => c.startAt === chosenFor(r)) + 1}希望で振替を承認`}
                </button>
              </div>
            </div>
          ) : (
            r.decisionNote && <div className="text-xs text-stone-600">返信メモ: {r.decisionNote}</div>
          )}
        </div>
      ))}
    </div>
  );
}

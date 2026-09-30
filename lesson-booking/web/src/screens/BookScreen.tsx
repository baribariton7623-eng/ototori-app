import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicHost, Rules, Slot, StudentBooking } from '../api/types';
import { SlotPicker } from '../components/SlotPicker';
import { ErrorBanner, Notice, Spinner } from '../components/ui';
import { fmtRange } from '../lib/format';

/** 生徒: 主催者を選び、空き枠から予約する */
export function BookScreen({ rules, onBooked }: { rules: Rules; onBooked: (b: StudentBooking) => void }) {
  const [hosts, setHosts] = useState<PublicHost[] | null>(null);
  const [hostId, setHostId] = useState<string>('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StudentBooking | null>(null);

  useEffect(() => {
    api
      .hosts()
      .then((h) => {
        setHosts(h);
        if (h.length === 1 && h[0]) setHostId(h[0].id);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    if (!hostId) return;
    setSlots(null);
    setSelected(null);
    api.slots(hostId).then((r) => setSlots(r.slots)).catch(setError);
  }, [hostId]);

  const host = hosts?.find((h) => h.id === hostId) ?? null;
  const selectedSlot = slots?.find((s) => s.startAt === selected) ?? null;

  async function book() {
    if (!selectedSlot) return;
    setBusy(true);
    setError(null);
    try {
      const b = await api.createBooking(hostId, selectedSlot.startAt, note);
      setDone(b);
      onBooked(b);
      setNote('');
      setSelected(null);
      const r = await api.slots(hostId);
      setSlots(r.slots);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (hosts === null) return <Spinner />;
  if (hosts.length === 0) return <Notice>まだ主催者が登録されていません。</Notice>;

  return (
    <div className="space-y-4">
      {done && (
        <Notice tone="success">
          予約しました: {fmtRange(done.startAt, done.endAt)}
          <button type="button" className="ml-2 underline text-xs" onClick={() => setDone(null)}>閉じる</button>
        </Notice>
      )}

      {hosts.length > 1 && (
        <div className="card">
          <label className="label" htmlFor="host-select">講師</label>
          <select id="host-select" className="input" value={hostId} onChange={(e) => setHostId(e.target.value)}>
            <option value="">選択してください</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>{h.displayName}({h.lessonMinutes}分)</option>
            ))}
          </select>
        </div>
      )}

      {host && (
        <div className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{host.displayName} の空き枠</h2>
            <span className="text-xs text-stone-500">{host.lessonMinutes}分 / 予約は{rules.bookingHorizonDays}日先まで</span>
          </div>
          {slots === null ? <Spinner /> : <SlotPicker slots={slots} selected={selected} onSelect={setSelected} />}
        </div>
      )}

      {selectedSlot && (
        <div className="card space-y-3 sticky bottom-2 border-emerald-300">
          <div className="text-sm">
            <span className="text-stone-500 text-xs block">選択中</span>
            <span className="font-medium">{fmtRange(selectedSlot.startAt, selectedSlot.endAt)}</span>
          </div>
          <div>
            <label className="label" htmlFor="book-note">備考(任意)</label>
            <input id="book-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 初回です。発声中心でお願いします" />
          </div>
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>選び直す</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={book}>{busy ? '予約中…' : 'この枠を予約する'}</button>
          </div>
        </div>
      )}
      {!selectedSlot && <ErrorBanner error={error} onClose={() => setError(null)} />}
    </div>
  );
}

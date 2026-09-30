import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicHost, Rules, Slot, StudentBooking } from '../api/types';
import { SlotPicker } from '../components/SlotPicker';
import { ErrorBanner, Notice, Spinner } from '../components/ui';
import { fmtRange } from '../lib/format';

interface Props {
  slug: string;
  rules: Rules;
  signedIn: boolean;
  onRequireLogin: () => void;
  onBooked: (b: StudentBooking) => void;
}

/** 主催者の公開予約ページ(#/h/<slug>)。ログインなしで閲覧でき、予約時にログインを求める */
export function BookScreen({ slug, rules, signedIn, onRequireLogin, onBooked }: Props) {
  const [host, setHost] = useState<PublicHost | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StudentBooking | null>(null);

  useEffect(() => {
    setHost(null);
    setSlots(null);
    setSelected(null);
    api
      .hostBySlug(slug)
      .then((h) => {
        setHost(h);
        return api.slots(h.id).then((r) => setSlots(r.slots));
      })
      .catch(setError);
  }, [slug]);

  const selectedSlot = slots?.find((s) => s.startAt === selected) ?? null;

  async function book() {
    if (!host || !selectedSlot) return;
    if (!signedIn) {
      onRequireLogin();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const b = await api.createBooking(host.id, selectedSlot.startAt, note);
      setDone(b);
      onBooked(b);
      setNote('');
      setSelected(null);
      const r = await api.slots(host.id);
      setSlots(r.slots);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error && !host) return <ErrorBanner error={error} />;
  if (host === null) return <Spinner />;

  return (
    <div className="space-y-4">
      {done && (
        <Notice tone="success">
          予約しました: {fmtRange(done.startAt, done.endAt)}
          <a href="#/mine" className="ml-2 underline text-xs">マイ予約を見る</a>
          <button type="button" className="ml-2 underline text-xs" onClick={() => setDone(null)}>閉じる</button>
        </Notice>
      )}

      <div className="card space-y-1">
        <h1 className="text-lg font-semibold">{host.displayName}</h1>
        {host.bio && <p className="text-sm text-stone-700 whitespace-pre-wrap">{host.bio}</p>}
        <div className="text-xs text-stone-500">1回 {host.lessonMinutes}分 · 予約は{rules.bookingHorizonDays}日先まで</div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">空き枠</h2>
        {slots === null ? <Spinner /> : <SlotPicker slots={slots} selected={selected} onSelect={setSelected} />}
      </div>

      {selectedSlot && (
        <div className="card space-y-3 sticky bottom-2 border-emerald-300">
          <div className="text-sm">
            <span className="text-stone-500 text-xs block">選択中</span>
            <span className="font-medium">{fmtRange(selectedSlot.startAt, selectedSlot.endAt)}</span>
          </div>
          {signedIn ? (
            <div>
              <label className="label" htmlFor="book-note">備考(任意)</label>
              <input id="book-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 初回です。発声中心でお願いします" />
            </div>
          ) : (
            <Notice>予約にはログインが必要です。</Notice>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>選び直す</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={book}>
              {busy ? '予約中…' : signedIn ? 'この枠を予約する' : 'ログインして予約する'}
            </button>
          </div>
        </div>
      )}
      {!selectedSlot && <ErrorBanner error={error} onClose={() => setError(null)} />}
    </div>
  );
}

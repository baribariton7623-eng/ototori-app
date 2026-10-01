import { useState } from 'react';
import { api } from '../../../api/client';
import type { AvailabilityWindow, Host } from '../../../api/types';
import { Spinner } from '../../../components/ui';
import { WEEKDAY_JA } from '../../../lib/format';

/** 営業時間枠(曜日ごと) */
export function WindowsSection({ host, windows, run }: { host: Host; windows: AvailabilityWindow[] | null; run: (p: Promise<unknown>) => void }) {
  const [win, setWin] = useState({ weekday: 1, startTime: '10:00', endTime: '18:00' });
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">営業時間枠(曜日ごと)</h2>
      <p className="text-xs text-stone-600">この時間帯の中からレッスン長で枠を切り出します。同じ曜日に複数登録できます(例: 10:00-12:00 と 14:00-18:00)。</p>
      {windows === null ? <Spinner /> : (
        <ul className="divide-y divide-stone-100">
          {[...windows].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map((w) => (
            <li key={w.id} className="flex items-center justify-between py-2 text-sm">
              <span><b>{WEEKDAY_JA[w.weekday]}</b> {w.startTime} – {w.endTime}</span>
              <button type="button" className="text-xs text-red-700 underline" onClick={() => run(api.removeWindow(host.id, w.id))}>削除</button>
            </li>
          ))}
          {windows.length === 0 && <li className="py-2 text-sm text-stone-500">まだ登録されていません。登録するまで空き枠は表示されません。</li>}
        </ul>
      )}
      <form
        className="grid grid-cols-2 sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(api.addWindow(host.id, win));
        }}
      >
        <div>
          <label className="label" htmlFor="w-day">曜日</label>
          <select id="w-day" className="input" value={win.weekday} onChange={(e) => setWin({ ...win, weekday: Number(e.target.value) })}>
            {WEEKDAY_JA.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="w-start">開始</label>
          <input id="w-start" className="input" type="time" step={900} value={win.startTime} onChange={(e) => setWin({ ...win, startTime: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="w-end">終了</label>
          <input id="w-end" className="input" type="time" step={900} value={win.endTime} onChange={(e) => setWin({ ...win, endTime: e.target.value })} required />
        </div>
        <button type="submit" className="btn-secondary col-span-2 sm:col-span-1">追加</button>
      </form>
    </section>
  );
}

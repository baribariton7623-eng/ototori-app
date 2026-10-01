import { useState } from 'react';
import { api } from '../../../api/client';
import type { BillingInfo, Host, HostCalendar } from '../../../api/types';
import { Badge, Notice, Spinner } from '../../../components/ui';

/** Google アカウントとの連携 */
export function GoogleSection({ host, google, run, onError }: { host: Host; google: { connected: boolean } | null; run: (p: Promise<unknown>) => void; onError: (e: unknown) => void }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Google カレンダー連携</h2>
      {google === null ? (
        <Spinner />
      ) : google.connected ? (
        <div className="flex items-center justify-between">
          <Badge tone="green">連携済み</Badge>
          <button type="button" className="btn-danger" onClick={() => run(api.googleDisconnect(host.id))}>連携を解除</button>
        </div>
      ) : (
        <div className="space-y-2">
          <Notice tone="warn">未連携です。連携すると、登録したカレンダーの予定を空き枠から除外し、予約をカレンダーに書き込めます。</Notice>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              api
                .googleConnectUrl(host.id)
                .then(({ url }) => {
                  window.location.href = url;
                })
                .catch(onError)
            }
          >
            Google と連携する
          </button>
        </div>
      )}
    </section>
  );
}

/** 空き枠の判定に使うカレンダーと、予約の書き込み先 */
export function CalendarsSection({ host, calendars, billing, run }: { host: Host; calendars: HostCalendar[] | null; billing: BillingInfo | null; run: (p: Promise<unknown>) => void }) {
  const [cal, setCal] = useState<{ calendarId: string; label: string; role: HostCalendar['role'] }>({ calendarId: '', label: '', role: 'busy_source' });
  const hasWriteTarget = calendars?.some((c) => c.role === 'write_target') ?? false;
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">連携カレンダー</h2>
      {billing?.effectivePlan === 'free' && (
        <Notice tone="warn">フリープランでは予定の参照のみ行い、予約イベントの自動作成はプロプランで有効になります。</Notice>
      )}
      <p className="text-xs text-stone-600">
        「書き込み先」は予約イベントを作成するカレンダー(1件)。「参照のみ」は予定を空き枠から除外するだけのカレンダー(複数可)。どちらも予定がある時間は空き枠から外れます。
      </p>
      {calendars === null ? <Spinner /> : (
        <ul className="divide-y divide-stone-100">
          {calendars.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium">{c.label || c.calendarId}</span>
                {c.label && <span className="ml-2 text-xs text-stone-500">{c.calendarId}</span>}
                <span className="ml-2"><Badge tone={c.role === 'write_target' ? 'green' : 'neutral'}>{c.role === 'write_target' ? '書き込み先' : '参照のみ'}</Badge></span>
              </div>
              <button type="button" className="text-xs text-red-700 underline" onClick={() => run(api.removeCalendar(host.id, c.id))}>解除</button>
            </li>
          ))}
          {calendars.length === 0 && <li className="py-2 text-sm text-stone-500">まだ登録されていません。</li>}
        </ul>
      )}
      <form
        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(api.addCalendar(host.id, { calendarId: cal.calendarId.trim(), label: cal.label.trim(), role: cal.role }).then(() => setCal({ calendarId: '', label: '', role: 'busy_source' })));
        }}
      >
        <div>
          <label className="label" htmlFor="c-id">カレンダーID</label>
          <input id="c-id" className="input" placeholder="primary または xxx@group.calendar.google.com" value={cal.calendarId} onChange={(e) => setCal({ ...cal, calendarId: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="c-label">表示名</label>
          <input id="c-label" className="input" placeholder="例: 教室" value={cal.label} onChange={(e) => setCal({ ...cal, label: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="c-role">用途</label>
          <select id="c-role" className="input" value={cal.role} onChange={(e) => setCal({ ...cal, role: e.target.value as HostCalendar['role'] })}>
            <option value="busy_source">参照のみ</option>
            <option value="write_target" disabled={hasWriteTarget}>書き込み先</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">追加</button>
      </form>
    </section>
  );
}

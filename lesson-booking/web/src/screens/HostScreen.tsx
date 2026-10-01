import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Host, Rules } from '../api/types';
import { BookingsTab } from './host/BookingsTab';
import { OrgTab } from './host/OrgTab';
import { RequestsTab } from './host/RequestsTab';
import { SettingsTab } from './host/SettingsTab';

type Tab = 'requests' | 'bookings' | 'org' | 'settings';

/** 主催者: 承認待ちの処理・予約一覧・設定(営業時間枠・カレンダー・Google 連携) */
export function HostScreen({
  host,
  rules,
  onHostUpdated,
  onDeleted,
}: {
  host: Host;
  rules: Rules;
  onHostUpdated: (h: Host) => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>('requests');
  const [inviteCount, setInviteCount] = useState(0);

  useEffect(() => {
    if (host.organizationId) {
      setInviteCount(0);
      return;
    }
    api.myInvitations().then((l) => setInviteCount(l.length)).catch(() => setInviteCount(0));
  }, [host.organizationId, tab]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    api.pendingRequestCount(host.id).then((c) => setPendingCount(c.pending)).catch(() => setPendingCount(null));
  }, [host.id, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'requests', label: `承認待ち${pendingCount ? ` (${pendingCount})` : ''}` },
    { key: 'bookings', label: '予約一覧' },
    { key: 'org', label: `教室${inviteCount ? ` (${inviteCount})` : ''}` },
    { key: 'settings', label: '設定' },
  ];

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-lg bg-stone-100 p-1" aria-label="主催者メニュー">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium ${tab === t.key ? 'bg-white shadow-sm text-stone-900' : 'text-stone-600'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'requests' && <RequestsTab host={host} rules={rules} />}
      {tab === 'bookings' && <BookingsTab host={host} rules={rules} />}
      {tab === 'org' && <OrgTab host={host} onChanged={() => void api.me().then((m) => m.host && onHostUpdated(m.host))} />}
      {tab === 'settings' && <SettingsTab host={host} rules={rules} onHostUpdated={onHostUpdated} onDeleted={onDeleted} />}
    </div>
  );
}

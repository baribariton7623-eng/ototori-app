import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicHost } from '../api/types';
import { Notice, Spinner } from '../components/ui';

/** 生徒のホーム。予約リンクを持たない場合の案内と、過去に予約した講師へのショートカット */
export function StudentHomeScreen() {
  const [hosts, setHosts] = useState<PublicHost[] | null>(null);

  useEffect(() => {
    api
      .myBookings()
      .then(async (list) => {
        const ids = [...new Set(list.map((b) => b.hostId))];
        const found = await Promise.all(ids.map((id) => api.hostPublic(id).catch(() => null)));
        setHosts(found.filter((h): h is PublicHost => h !== null));
      })
      .catch(() => setHosts([]));
  }, []);

  return (
    <div className="space-y-4">
      <Notice>講師から共有された予約ページのリンク(例: <code>…/#/h/講師のID</code>)を開くと、その講師の空き枠を予約できます。</Notice>
      {hosts === null ? (
        <Spinner />
      ) : hosts.length > 0 ? (
        <div className="card space-y-2">
          <h2 className="font-semibold">予約したことのある講師</h2>
          <ul className="divide-y divide-stone-100">
            {hosts.map((h) => (
              <li key={h.id} className="py-2">
                <a href={`#/h/${h.slug}`} className="text-emerald-800 underline">{h.displayName}</a>
                <span className="ml-2 text-xs text-stone-500">{h.lessonMinutes}分</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

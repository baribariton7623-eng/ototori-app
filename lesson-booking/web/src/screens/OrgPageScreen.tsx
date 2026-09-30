import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicOrganization } from '../api/types';
import { ErrorBanner, Spinner } from '../components/ui';

/** 教室の公開ページ(#/o/<slug>)。所属講師の一覧から各講師の予約ページへ */
export function OrgPageScreen({ slug }: { slug: string }) {
  const [org, setOrg] = useState<PublicOrganization | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setOrg(null);
    setError(null);
    api.orgBySlug(slug).then(setOrg).catch(setError);
  }, [slug]);

  if (error) return <ErrorBanner error={error} />;
  if (!org) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="card space-y-1">
        <h1 className="text-lg font-semibold">{org.name}</h1>
        {org.bio && <p className="text-sm text-stone-700 whitespace-pre-wrap">{org.bio}</p>}
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">講師を選んで予約</h2>
        <ul className="divide-y divide-stone-100">
          {org.teachers.map((t) => (
            <li key={t.id} className="py-3">
              <a href={`#/h/${t.slug}`} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-emerald-800 underline">{t.displayName}</span>
                  <span className="ml-2 text-xs text-stone-500">{t.lessonMinutes}分</span>
                  {t.bio && <span className="block text-xs text-stone-600 mt-0.5 line-clamp-2">{t.bio}</span>}
                </span>
                <span className="text-stone-400" aria-hidden>›</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

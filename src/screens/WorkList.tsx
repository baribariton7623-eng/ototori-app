import { useEffect, useState } from 'react';
import FavoriteButton from '../components/FavoriteButton';
import { loadWorksIndex } from '../data/worksIndex';
import { useAuth } from '../hooks/useAuth';
import { addFavorite, listFavoriteWorkIds, removeFavorite } from '../lib/favorites';
import type { WorksIndex } from '../types/music';

interface WorkListProps {
  composer: string;
  onSelectWork: (workId: string) => void;
  onRequireLogin: () => void;
}

export default function WorkList({ composer, onSelectWork, onRequireLogin }: WorkListProps) {
  const [index, setIndex] = useState<WorksIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();

  useEffect(() => {
    loadWorksIndex()
      .then(setIndex)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    listFavoriteWorkIds(user.id).then((ids) => setFavoriteIds(new Set(ids)));
  }, [user]);

  const handleToggleFavorite = async (workId: string) => {
    if (!user) return;
    const isFav = favoriteIds.has(workId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(workId);
      else next.add(workId);
      return next;
    });
    const succeeded = isFav ? await removeFavorite(user.id, workId) : await addFavorite(user.id, workId);
    if (!succeeded) {
      // 保存に失敗した場合はオプティミスティック更新をロールバックし、見た目とDBの実態を一致させる
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(workId);
        else next.delete(workId);
        return next;
      });
    }
  };

  if (error) return <p className="p-6 text-base text-red-700">{error}</p>;
  if (!index) return <p className="p-6 text-base text-ink-soft">読み込み中...</p>;

  const works = index.works.filter((work) => work.composer === composer);
  if (works.length === 0) {
    return <p className="p-6 text-base text-ink-soft">この作曲家の収録曲がまだありません</p>;
  }

  return (
    <ul className="space-y-2 px-4 py-4 sm:px-6">
      {works.map((work) => (
        <li
          key={work.id}
          className="flex items-center gap-1 rounded-2xl border border-hairline bg-card pr-2 shadow-sm transition hover:border-accent/40 hover:shadow-md"
        >
          <button onClick={() => onSelectWork(work.id)} className="flex-1 px-5 py-4 text-left">
            <div className="text-lg font-semibold text-ink">{work.title}</div>
            <div className="mt-0.5 text-sm text-ink-soft">{work.composer}</div>
          </button>
          <FavoriteButton
            isFavorite={favoriteIds.has(work.id)}
            isLoggedIn={!!user}
            onToggle={() => handleToggleFavorite(work.id)}
            onRequireLogin={onRequireLogin}
          />
        </li>
      ))}
    </ul>
  );
}

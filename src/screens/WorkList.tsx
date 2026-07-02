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
    if (isFav) await removeFavorite(user.id, workId);
    else await addFavorite(user.id, workId);
  };

  if (error) return <p className="p-4 text-red-400">{error}</p>;
  if (!index) return <p className="p-4 text-gray-400">読み込み中...</p>;

  const works = index.works.filter((work) => work.composer === composer);
  if (works.length === 0) {
    return <p className="p-4 text-gray-400">この作曲家の収録曲がまだありません</p>;
  }

  return (
    <ul className="divide-y divide-gray-800">
      {works.map((work) => (
        <li key={work.id} className="flex items-center hover:bg-gray-800">
          <button onClick={() => onSelectWork(work.id)} className="flex-1 px-4 py-4 text-left">
            <div className="font-medium">{work.title}</div>
            <div className="text-sm text-gray-400">{work.composer}</div>
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

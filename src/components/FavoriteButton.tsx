import type { MouseEvent } from 'react';

interface FavoriteButtonProps {
  isFavorite: boolean;
  isLoggedIn: boolean;
  onToggle: () => void;
  onRequireLogin: () => void;
}

export default function FavoriteButton({
  isFavorite,
  isLoggedIn,
  onToggle,
  onRequireLogin,
}: FavoriteButtonProps) {
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      aria-label={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
      className={`shrink-0 px-3 text-xl ${isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'}`}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}

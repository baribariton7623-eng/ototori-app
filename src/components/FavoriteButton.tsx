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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl transition active:scale-90 ${
        isFavorite ? 'text-gold' : 'text-ink-faint hover:text-ink-soft'
      }`}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}

import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

export default function Header({ title, onBack, right }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="戻る"
          className="rounded p-1 text-xl text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

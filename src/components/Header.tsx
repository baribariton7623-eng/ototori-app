import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

export default function Header({ title, onBack, right }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2 px-3 sm:px-4">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="戻る"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-ink-soft transition hover:bg-paper-soft active:scale-95"
          >
            ←
          </button>
        ) : (
          <div className="h-11 w-11 shrink-0" aria-hidden />
        )}
        <h1 className="flex-1 truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">
          {title}
        </h1>
        {right}
      </div>
    </header>
  );
}

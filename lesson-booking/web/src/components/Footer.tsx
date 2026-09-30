import { operator } from '../legal/operator';

export function Footer() {
  return (
    <footer className="max-w-3xl mx-auto px-4 py-8 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
      <span>© {operator.serviceName}</span>
      <a className="underline" href="/terms">利用規約</a>
      <a className="underline" href="/privacy">プライバシーポリシー</a>
      <a className="underline" href="/tokushoho">特定商取引法に基づく表記</a>
      {operator.email && (
        <a className="underline" href={`mailto:${operator.email}`}>お問い合わせ</a>
      )}
    </footer>
  );
}

import { useState } from 'react';
import { api } from '../api/client';
import { ErrorBanner, Modal } from './ui';

interface Props {
  /** 入力させる確認文字列(主催者は URL 名、生徒はメールアドレス) */
  confirmText: string;
  confirmLabel: string;
  description: string[];
  onDeleted: () => void;
}

/** 退会ボタン + 確認モーダル */
export function DeleteAccount({ confirmText, confirmLabel, description, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe(typed.trim());
      onDeleted();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-2 border-red-200">
      <h2 className="font-semibold text-red-800">退会</h2>
      <ul className="list-disc pl-5 text-xs text-stone-700 space-y-0.5">
        {description.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>退会する</button>
      </div>
      {open && (
        <Modal title="退会の確認" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm">この操作は取り消せません。確認のため、{confirmLabel}「<b className="font-mono">{confirmText}</b>」を入力してください。</p>
            <input className="input font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="確認入力" autoFocus />
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>やめる</button>
              <button
                type="button"
                className="btn bg-red-700 text-white hover:bg-red-800"
                disabled={busy || typed.trim().toLowerCase() !== confirmText.toLowerCase()}
                onClick={submit}
              >
                {busy ? '処理中…' : '退会する'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

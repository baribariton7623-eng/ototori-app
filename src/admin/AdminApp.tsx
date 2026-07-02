import { useEffect, useState } from 'react';
import { loadWorksIndex } from '../data/worksIndex';
import type { WorksIndex } from '../types/music';

/**
 * 作品メタ情報(タイトル・作曲家・生年)の編集画面。開発専用(本番ビルドには含まれない)。
 *
 * 楽譜データ(音符)そのものはMusicXML(MuseScore等で作成)が正なので、この画面では扱わない。
 * ここで編集するのは content/musicxml/<work-id>/meta.json の中身のみで、
 * 保存操作はファイルへの書き込みではなく「JSONのダウンロード/コピー」に留め、
 * 実際の配置とGitコミットは運営者(あなた)が手動で行う(Cantata-appの管理画面と同じ方針)。
 */

interface WorkMetaForm {
  workId: string;
  title: string;
  composer: string;
  composerSortKey: string;
  isNew: boolean;
}

function blankForm(): WorkMetaForm {
  return { workId: '', title: '', composer: '', composerSortKey: '', isNew: true };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildMetaJson(form: WorkMetaForm): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  if (form.title.trim()) json.title = form.title.trim();
  if (form.composer.trim()) json.composer = form.composer.trim();
  if (form.composerSortKey.trim()) json.composerSortKey = Number(form.composerSortKey.trim());
  return json;
}

export default function AdminApp() {
  const [index, setIndex] = useState<WorksIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WorkMetaForm | null>(null); // null = 一覧表示中
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    loadWorksIndex()
      .then(setIndex)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const startNew = () => {
    setSavedMessage('');
    setForm(blankForm());
  };

  const startEdit = (workId: string) => {
    setSavedMessage('');
    const work = index?.works.find((w) => w.id === workId);
    if (!work) return;
    setForm({
      workId: work.id,
      title: work.title,
      composer: work.composer,
      composerSortKey: work.composerSortKey !== undefined ? String(work.composerSortKey) : '',
      isNew: false,
    });
  };

  const updateField = (field: keyof WorkMetaForm, value: string) => {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  };

  const handleSave = () => {
    if (!form) return;
    if (!form.workId.trim()) {
      setError('作品ID(work-id)を入力してください(例: dona-nobis-pacem)');
      return;
    }
    setError(null);
    downloadJson('meta.json', buildMetaJson(form));
    setSavedMessage(
      `meta.json をダウンロードしました。content/musicxml/${form.workId}/meta.json に配置し` +
        `(同じフォルダに最低1つ .musicxml が必要です)、npm run data:convert を実行してから反映を確認し、Gitコミットしてください。`,
    );
  };

  if (error && !form) return <div className="p-6 text-red-600">{error}</div>;
  if (!index) return <div className="p-6 text-gray-500">読み込み中...</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold text-gray-900">作品メタ情報 管理画面(開発専用)</h1>
      <p className="mb-6 text-sm text-gray-500">
        ここで編集したJSONはダウンロード/コピーしてから、手動で <code>content/musicxml/&lt;work-id&gt;/meta.json</code>{' '}
        に配置し <code>npm run data:convert</code> を実行してください。楽譜データ(音符)自体はMuseScore等でMusicXMLを作成する必要があり、この画面では編集できません。この画面自体は本番ビルドには含まれません。
      </p>

      {!form && (
        <div>
          <button
            onClick={startNew}
            className="mb-4 rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
          >
            + 新規作品を追加
          </button>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
            {index.works.map((work) => (
              <li key={work.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-mono text-sm text-gray-500">{work.id}</span>{' '}
                  <span className="font-medium">{work.title}</span>
                  <div className="text-sm text-gray-500">
                    {work.composer}
                    {work.composerSortKey !== undefined ? `(${work.composerSortKey}年生まれ)` : ''} ・{' '}
                    {work.movements.length}楽章
                  </div>
                </div>
                <button
                  onClick={() => startEdit(work.id)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  編集
                </button>
              </li>
            ))}
            {index.works.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">まだ作品がありません</li>
            )}
          </ul>
        </div>
      )}

      {form && (
        <div className="space-y-6">
          <button onClick={() => setForm(null)} className="text-sm text-gray-500 hover:text-gray-800">
            ← 一覧に戻る
          </button>

          <section className="grid grid-cols-2 gap-4 rounded-md border border-gray-200 bg-white p-4">
            <label className="col-span-2">
              <span className="mb-1 block text-sm text-gray-600">作品ID(work-id、フォルダ名になります)</span>
              <input
                type="text"
                value={form.workId}
                disabled={!form.isNew}
                onChange={(e) => updateField('workId', e.target.value)}
                placeholder="例: dona-nobis-pacem"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 disabled:bg-gray-100 disabled:text-gray-500"
              />
              {!form.isNew && (
                <span className="mt-1 block text-xs text-gray-400">
                  既存作品はフォルダ名と一致させる必要があるため変更できません
                </span>
              )}
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-sm text-gray-600">作品タイトル</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="MusicXMLのwork-titleを使う場合は空欄のままでよい"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5"
              />
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-sm text-gray-600">作曲家</span>
              <input
                type="text"
                value={form.composer}
                onChange={(e) => updateField('composer', e.target.value)}
                placeholder="例: バッハ"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5"
              />
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-sm text-gray-600">作曲家の生年(時代順ソート用、任意)</span>
              <input
                type="number"
                value={form.composerSortKey}
                onChange={(e) => updateField('composerSortKey', e.target.value)}
                placeholder="例: 1685"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5"
              />
            </label>
          </section>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSave} className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700">
              meta.jsonをダウンロード
            </button>
            <button
              onClick={() => copyToClipboard(JSON.stringify(buildMetaJson(form), null, 2))}
              className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              JSONをクリップボードにコピー
            </button>
          </div>
          {savedMessage && <p className="text-sm text-green-700">{savedMessage}</p>}

          <details className="rounded-md border border-gray-200 bg-white p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">
              meta.json プレビュー
            </summary>
            <pre className="mt-2 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
              {JSON.stringify(buildMetaJson(form), null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

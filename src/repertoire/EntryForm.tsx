import { useState } from 'react';
import { MEMO_MAX_LENGTH, normalizeFormValues, validateEntryForm, type FormErrors } from './logic';
import { STATUS_LABELS, STATUS_OPTIONS, type EntryFormValues } from './types';
import type { EntryInput } from './api';

interface EntryFormProps {
  initialValues: EntryFormValues;
  submitLabel: string;
  /** 保存失敗時はエラーメッセージを返す(成功時は null) */
  onSubmit: (input: EntryInput) => Promise<string | null>;
  onCancel: () => void;
}

const inputClass =
  'h-12 w-full rounded-xl border border-hairline bg-paper px-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent';

export default function EntryForm({ initialValues, submitLabel, onSubmit, onCancel }: EntryFormProps) {
  const [values, setValues] = useState<EntryFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateEntryForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const error = await onSubmit(normalizeFormValues(values));
    setSubmitting(false);
    if (error) setSubmitError(error);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-hairline bg-card p-5 shadow-sm">
      <Field label="作曲家" error={errors.composer} required>
        <input
          type="text"
          value={values.composer}
          onChange={(e) => update('composer', e.target.value)}
          placeholder="例: シューベルト"
          className={inputClass}
        />
      </Field>
      <Field label="作品名" error={errors.title} required>
        <input
          type="text"
          value={values.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="例: 野ばら"
          className={inputClass}
        />
      </Field>
      <Field label="ステータス" error={errors.status}>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s}
              className={`flex h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition ${
                values.status === s
                  ? 'border-accent bg-accent text-paper'
                  : 'border-hairline bg-paper text-ink-soft hover:bg-paper-soft'
              }`}
            >
              <input
                type="radio"
                name="status"
                value={s}
                checked={values.status === s}
                onChange={() => update('status', s)}
                className="sr-only"
              />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </Field>
      <Field label="レッスン日" error={errors.lessonDate}>
        <input
          type="date"
          value={values.lessonDate}
          onChange={(e) => update('lessonDate', e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="メモ" error={errors.memo} hint={`${values.memo.length} / ${MEMO_MAX_LENGTH}`}>
        <textarea
          value={values.memo}
          onChange={(e) => update('memo', e.target.value)}
          rows={3}
          placeholder="練習のポイント、講師への連絡事項など"
          className="w-full rounded-xl border border-hairline bg-paper px-4 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
      </Field>

      {submitError && <p className="text-sm text-red-700">{submitError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="h-12 flex-1 rounded-full bg-paper-soft text-base font-medium text-ink-soft transition hover:bg-hairline active:scale-95 disabled:opacity-40"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="h-12 flex-1 rounded-full bg-accent text-base font-semibold text-paper transition hover:bg-accent-dark active:scale-95 disabled:opacity-40"
        >
          {submitting ? '保存中...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-soft">
          {label}
          {required && <span className="ml-1 text-accent">*</span>}
        </span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

import type { Host, Rules } from '../../../api/types';
import { daysLabel } from '../../../lib/format';

/** 基本設定と予約ルールのフォーム(どちらの「保存」も全項目を送る) */
export interface HostForm {
  displayName: string;
  slug: string;
  bio: string;
  lessonMinutes: number;
  minLeadMinutes: number;
  rescheduleRangeDays: number;
  lateChangeThresholdDays: number;
  bookingHorizonDays: number;
}

export function hostForm(host: Host): HostForm {
  return {
    displayName: host.displayName,
    slug: host.slug,
    bio: host.bio,
    lessonMinutes: host.lessonMinutes,
    minLeadMinutes: host.minLeadMinutes,
    rescheduleRangeDays: host.rescheduleRangeDays,
    lateChangeThresholdDays: host.lateChangeThresholdDays,
    bookingHorizonDays: host.bookingHorizonDays,
  };
}

type FormProps = { form: HostForm; setForm: (f: HostForm) => void; onSave: () => void };

/** 予約・キャンセルのルール(講師ごとの受付期間・承認制の時期・振替期間) */
export function RulesSection({ rules, form, setForm, onSave }: FormProps & { rules: Rules }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">予約・キャンセルのルール</h2>
      <PolicyField
        id="h-horizon"
        label="予約を受け付ける期間"
        before="今日から"
        after="日先まで"
        limits={rules.policyLimits.bookingHorizonDays}
        value={form.bookingHorizonDays}
        onChange={(v) => setForm({ ...form, bookingHorizonDays: v })}
        help="生徒の予約ページに表示する空き枠の範囲です。"
      />
      <PolicyField
        id="h-threshold"
        label="キャンセル・変更を承認制にする時期"
        before="レッスン開始の"
        after="日前から"
        limits={rules.policyLimits.lateChangeThresholdDays}
        value={form.lateChangeThresholdDays}
        onChange={(v) => setForm({ ...form, lateChangeThresholdDays: v })}
        help={
          form.lateChangeThresholdDays > 0
            ? `開始${daysLabel(form.lateChangeThresholdDays)}前を過ぎたキャンセル・変更は、生徒がメッセージと対応方法を添えて申請し、あなたが承認します。それより前はすぐに反映されます。`
            : '0 日にすると承認制にならず、開始前ならいつでもすぐに反映されます。'
        }
      />
      <PolicyField
        id="h-range"
        label="振替を受け付ける期間"
        before="元のレッスン日から前後"
        after="日以内"
        limits={rules.policyLimits.rescheduleRangeDays}
        value={form.rescheduleRangeDays}
        onChange={(v) => setForm({ ...form, rescheduleRangeDays: v })}
        help={`承認制の期間に振替を申請するとき、生徒が選べる日時の範囲です。選択肢は「${daysLabel(form.rescheduleRangeDays)}以内の別日に振替を希望する」と表示されます。`}
      />
      <p className="text-xs text-stone-500">変更は今後の操作から適用されます。すでに受け付けた申請は、そのまま承認・却下できます。</p>
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onSave}>保存</button>
      </div>
    </section>
  );
}

/** 基本設定(表示名・URL 名・レッスン長・受付締切・紹介文) */
export function ProfileSection({ form, setForm, onSave }: FormProps) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">基本設定</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="label" htmlFor="h-name">表示名</label>
          <input id="h-name" className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="h-slug">URL 名(英小文字・数字・ハイフン)</label>
          <input id="h-slug" className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} pattern="[a-z0-9\-]{3,32}" />
        </div>
        <div>
          <label className="label" htmlFor="h-len">レッスン長(分)</label>
          <input id="h-len" className="input" type="number" min={5} step={5} value={form.lessonMinutes} onChange={(e) => setForm({ ...form, lessonMinutes: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="h-lead">受付締切(開始の何分前まで)</label>
          <input id="h-lead" className="input" type="number" min={0} step={30} value={form.minLeadMinutes} onChange={(e) => setForm({ ...form, minLeadMinutes: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="h-bio">紹介文(予約ページに表示)</label>
        <textarea id="h-bio" className="input min-h-20" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="例: 声楽・合唱のレッスンです。初心者歓迎。" />
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onSave}>保存</button>
      </div>
    </section>
  );
}

function PolicyField({
  id,
  label,
  before,
  after,
  limits,
  value,
  onChange,
  help,
}: {
  id: string;
  label: string;
  before: string;
  after: string;
  limits: { min: number; max: number };
  value: number;
  onChange: (v: number) => void;
  help: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}({limits.min}〜{limits.max}日)
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm">{before}</span>
        <input
          id={id}
          className="input w-24"
          type="number"
          min={limits.min}
          max={limits.max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-sm">{after}</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">{help}</p>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AvailabilityWindow, BillingInfo, ConnectStatus, Host, HostCalendar, Rules } from '../../api/types';
import { DeleteAccount } from '../../components/DeleteAccount';
import { ErrorBanner } from '../../components/ui';
import { CalendarsSection, GoogleSection } from './settings/CalendarSections';
import { FeeSection } from './settings/FeeSection';
import { ProfileSection, RulesSection, hostForm } from './settings/HostFormSections';
import { PlanSection } from './settings/PlanSection';
import { WindowsSection } from './settings/WindowsSection';

/** 設定タブ。データの取得はここでまとめて行い、各セクションに渡す(追加・削除のあとは全体を取り直す) */
export function SettingsTab({
  host,
  rules,
  onHostUpdated,
  onDeleted,
}: {
  host: Host;
  rules: Rules;
  onHostUpdated: (h: Host) => void;
  onDeleted: () => void;
}) {
  const [windows, setWindows] = useState<AvailabilityWindow[] | null>(null);
  const [calendars, setCalendars] = useState<HostCalendar[] | null>(null);
  const [google, setGoogle] = useState<{ connected: boolean } | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(() => hostForm(host));

  const load = useCallback(() => {
    api.windows(host.id).then(setWindows).catch(setError);
    api.calendars(host.id).then(setCalendars).catch(setError);
    api.googleStatus(host.id).then(setGoogle).catch(() => setGoogle({ connected: false }));
    api.billing(host.id).then(setBilling).catch(setError);
    api.connectStatus(host.id).then(setConnect).catch(setError);
  }, [host.id]);
  useEffect(() => {
    load();
  }, [load]);

  const run = (p: Promise<unknown>) => void p.then(load).catch(setError);
  const saveForm = () =>
    api
      .updateHost(host.id, form)
      .then((h) => {
        onHostUpdated(h);
        load();
      })
      .catch(setError);
  const publicUrl = billing?.publicUrl ?? `${window.location.origin}${window.location.pathname}#/h/${host.slug}`;
  const hereUrl = `${window.location.origin}${window.location.pathname}#/host`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 手動コピーにフォールバック */
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />

      <section className="card space-y-2 border-emerald-200">
        <h2 className="font-semibold">生徒に共有する予約ページ</h2>
        <div className="flex gap-2 items-center">
          <input className="input font-mono text-xs" readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} aria-label="予約ページURL" />
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={copyUrl}>{copied ? 'コピーしました' : 'コピー'}</button>
          <a className="btn-secondary whitespace-nowrap" href={publicUrl} target="_blank" rel="noreferrer">開く</a>
        </div>
        <p className="text-xs text-stone-600">この URL を LINE やメールで生徒に送ってください。URL 名は下の「基本設定」で変更できます(変更すると以前の URL は使えなくなります)。</p>
      </section>

      <PlanSection host={host} rules={rules} billing={billing} returnUrl={hereUrl} onError={setError} />
      <RulesSection rules={rules} form={form} setForm={setForm} onSave={saveForm} />
      <FeeSection
        host={host}
        rules={rules}
        connect={connect}
        returnUrl={hereUrl}
        onHostUpdated={onHostUpdated}
        reload={load}
        run={run}
        onError={setError}
      />
      <ProfileSection form={form} setForm={setForm} onSave={saveForm} />
      <GoogleSection host={host} google={google} run={run} onError={setError} />
      <CalendarsSection host={host} calendars={calendars} billing={billing} run={run} />
      <WindowsSection host={host} windows={windows} run={run} />

      <DeleteAccount
        confirmText={host.slug}
        confirmLabel="URL 名"
        description={[
          '今後の予約はすべて取り消され、生徒に休講のメールが届きます。',
          'プロプランは即時に解約されます(日割りの返金はありません)。',
          'Google カレンダーの連携を解除し、設定・予約履歴を含むすべての情報を削除します。',
          '予約ページの URL は使えなくなります。',
        ]}
        onDeleted={onDeleted}
      />
    </div>
  );
}

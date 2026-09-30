import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type {
  AvailabilityWindow,
  BillingInfo,
  ConnectStatus,
  FeeMethod,
  Host,
  HostBooking,
  HostCalendar,
  HostChangeRequest,
  Rules,
} from '../api/types';
import { DeleteAccount } from '../components/DeleteAccount';
import { Badge, ErrorBanner, Modal, Notice, Spinner } from '../components/ui';
import { OrgTab } from './OrgTab';
import { WEEKDAY_JA, fmtFull, fmtRange, yen } from '../lib/format';

type Tab = 'requests' | 'bookings' | 'org' | 'settings';

/** 主催者: 承認待ちの処理・予約一覧・設定(営業時間枠・カレンダー・Google 連携) */
export function HostScreen({
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
  const [tab, setTab] = useState<Tab>('requests');
  const [inviteCount, setInviteCount] = useState(0);

  useEffect(() => {
    if (host.organizationId) {
      setInviteCount(0);
      return;
    }
    api.myInvitations().then((l) => setInviteCount(l.length)).catch(() => setInviteCount(0));
  }, [host.organizationId, tab]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    api.changeRequests(host.id, 'pending').then((l) => setPendingCount(l.length)).catch(() => setPendingCount(null));
  }, [host.id, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'requests', label: `承認待ち${pendingCount ? ` (${pendingCount})` : ''}` },
    { key: 'bookings', label: '予約一覧' },
    { key: 'org', label: `教室${inviteCount ? ` (${inviteCount})` : ''}` },
    { key: 'settings', label: '設定' },
  ];

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-lg bg-stone-100 p-1" aria-label="主催者メニュー">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium ${tab === t.key ? 'bg-white shadow-sm text-stone-900' : 'text-stone-600'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'requests' && <RequestsTab host={host} rules={rules} />}
      {tab === 'bookings' && <BookingsTab host={host} rules={rules} />}
      {tab === 'org' && <OrgTab host={host} onChanged={() => void api.me().then((m) => m.host && onHostUpdated(m.host))} />}
      {tab === 'settings' && <SettingsTab host={host} rules={rules} onHostUpdated={onHostUpdated} onDeleted={onDeleted} />}
    </div>
  );
}

// ---------- 承認待ち ----------

function RequestsTab({ host, rules }: { host: Host; rules: Rules }) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [list, setList] = useState<HostChangeRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** 振替の承認で選んだ候補(申請ごと) */
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setList(null);
    api.changeRequests(host.id, filter).then(setList).catch(setError);
  }, [host.id, filter]);

  useEffect(() => {
    load();
  }, [load]);

  /** 選んだ候補。未選択なら空いている最上位の希望 */
  function chosenFor(r: HostChangeRequest): string | null {
    const picked = choice[r.id];
    if (picked && r.candidates.some((c) => c.startAt === picked && c.available)) return picked;
    return r.candidates.find((c) => c.available)?.startAt ?? null;
  }

  async function decide(r: HostChangeRequest, decision: 'approve' | 'reject') {
    setBusyId(r.id);
    setError(null);
    try {
      const startAt = decision === 'approve' && r.kind === 'reschedule' ? chosenFor(r) : undefined;
      await api.decide(host.id, r.id, decision, notes[r.id], startAt ?? undefined);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">変更・キャンセルの申請</h2>
        <select className="input w-auto py-1" value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')} aria-label="表示する申請">
          <option value="pending">承認待ちのみ</option>
          <option value="all">すべて</option>
        </select>
      </div>
      <Notice>
        開始まで{rules.lateChangeThresholdDays}日未満の申請です。承認すると予約がキャンセルまたは振替され、Google カレンダーにも反映されます。却下すると元の予約が維持されます。
      </Notice>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {list === null && <Spinner />}
      {list?.length === 0 && <div className="text-sm text-stone-500">申請はありません。</div>}
      {list?.map((r) => (
        <div key={r.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-stone-500">{r.student?.name || r.student?.email} · {fmtFull(r.createdAt)} 申請</div>
              <div className="font-medium">
                {r.kind === 'cancel' ? 'キャンセル' : '日時変更'}: {r.booking ? fmtRange(r.booking.startAt, r.booking.endAt) : '(予約なし)'}
              </div>
              {r.status !== 'pending' && r.approvedStartAt && <div className="text-sm">→ 振替先 <b>{fmtFull(r.approvedStartAt)}</b></div>}
            </div>
            <Badge tone={r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'green' : 'red'}>
              {r.status === 'pending' ? '承認待ち' : r.status === 'approved' ? '承認済み' : '却下'}
            </Badge>
          </div>
          <div className="text-sm">
            <Badge>{r.optionLabel}</Badge>
            {r.feeMethodLabel && <span className="ml-1"><Badge tone="amber">支払い方法: {r.feeMethodLabel}</Badge></span>}
            <p className="mt-1 whitespace-pre-wrap rounded bg-stone-50 p-2">{r.message}</p>
          </div>
          {r.status === 'pending' && r.kind === 'reschedule' && r.candidates.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="label">振替先を選んで承認(生徒の希望順)</legend>
              {r.candidates.map((c, i) => (
                <label
                  key={c.startAt}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${c.available ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${chosenFor(r) === c.startAt ? 'border-emerald-700 bg-emerald-50' : 'border-stone-300'}`}
                >
                  <input
                    type="radio"
                    name={`choice-${r.id}`}
                    disabled={!c.available}
                    checked={chosenFor(r) === c.startAt}
                    onChange={() => setChoice({ ...choice, [r.id]: c.startAt })}
                  />
                  <span className="w-14 text-xs font-medium text-stone-600">第{i + 1}希望</span>
                  <span className="flex-1">{fmtFull(c.startAt)}</span>
                  {!c.available && <span className="text-xs text-red-700">埋まっています</span>}
                </label>
              ))}
              {!r.candidates.some((c) => c.available) && (
                <p className="text-xs text-red-700">希望日時はすべて埋まっています。却下して、別の日時で申請し直すよう伝えてください。</p>
              )}
            </fieldset>
          )}
          {r.status === 'pending' ? (
            <div className="space-y-2">
              <input
                className="input"
                placeholder="生徒への返信メモ(任意)"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-danger" disabled={busyId === r.id} onClick={() => decide(r, 'reject')}>却下</button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === r.id || (r.kind === 'reschedule' && chosenFor(r) === null)}
                  onClick={() => decide(r, 'approve')}
                >
                  {r.kind === 'cancel'
                    ? r.feeMethodLabel
                      ? `キャンセルと${r.feeMethodLabel}を承認`
                      : 'キャンセルを承認'
                    : `第${r.candidates.findIndex((c) => c.startAt === chosenFor(r)) + 1}希望で振替を承認`}
                </button>
              </div>
            </div>
          ) : (
            r.decisionNote && <div className="text-xs text-stone-600">返信メモ: {r.decisionNote}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 予約一覧 ----------

function BookingsTab({ host, rules }: { host: Host; rules: Rules }) {
  const [list, setList] = useState<HostBooking[] | null>(null);
  const [methods, setMethods] = useState<FeeMethod[]>([]);

  useEffect(() => {
    api.hostPublic(host.id).then((p) => setMethods(p.feeMethods)).catch(() => setMethods([]));
  }, [host.id]);
  const methodLabel = (m: FeeMethod) => rules.feeMethods.find((x) => x.value === m)?.label ?? m;
  const [error, setError] = useState<unknown>(null);
  const [cancelTarget, setCancelTarget] = useState<HostBooking | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);

  async function submitCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api.cancelByHost(host.id, cancelTarget.id, reason.trim());
      setCancelTarget(null);
      setReason('');
      await load();
    } catch (e) {
      setCancelError(e);
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(() => api.hostBookings(host.id).then(setList).catch(setError), [host.id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (list === null) return <Spinner />;
  const now = Date.now();
  const upcoming = list.filter((b) => b.status === 'confirmed' && new Date(b.endAt).getTime() > now);
  const others = list.filter((b) => !upcoming.includes(b)).reverse();

  return (
    <div className="space-y-3">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <h2 className="font-semibold">今後の予約({upcoming.length})</h2>
      {upcoming.length === 0 && <div className="text-sm text-stone-500">予約はありません。</div>}
      {upcoming.map((b) => (
        <div key={b.id} className="card flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">{fmtRange(b.startAt, b.endAt)}</div>
            <div className="text-sm text-stone-600">{b.student?.name || '(名前なし)'} <span className="text-xs">{b.student?.email}</span></div>
            {b.note && <div className="text-xs text-stone-500">備考: {b.note}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone="green">確定</Badge>
            <button type="button" className="text-xs text-red-700 underline" onClick={() => setCancelTarget(b)}>休講にする</button>
          </div>
        </div>
      ))}
      {cancelTarget && (
        <Modal title="休講にする" onClose={() => setCancelTarget(null)}>
          <div className="space-y-3">
            <div className="text-sm">
              <div className="text-xs text-stone-500">対象</div>
              <div className="font-medium">{fmtRange(cancelTarget.startAt, cancelTarget.endAt)}</div>
              <div className="text-stone-600">{cancelTarget.student?.name || cancelTarget.student?.email}</div>
            </div>
            <Notice tone="warn">予約を取り消し、生徒にメールで知らせます。Google カレンダーのイベントも削除されます。</Notice>
            <div>
              <label className="label" htmlFor="cancel-reason">生徒へのメッセージ(必須)</label>
              <textarea
                id="cancel-reason"
                className="input min-h-24"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例: 体調不良のため休講とさせてください。振替は予約ページからお選びください。"
              />
            </div>
            <ErrorBanner error={cancelError} onClose={() => setCancelError(null)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>戻る</button>
              <button type="button" className="btn-danger" disabled={busy || !reason.trim()} onClick={submitCancel}>
                {busy ? '処理中…' : '休講にする'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {others.length > 0 && (
        <>
          <h2 className="font-semibold text-stone-600 pt-2">過去・キャンセル</h2>
          {others.map((b) => (
            <div key={b.id} className="card flex items-start justify-between gap-2 opacity-80">
              <div>
                <div className="text-sm">{fmtRange(b.startAt, b.endAt)}</div>
                <div className="text-xs text-stone-600">{b.student?.name || b.student?.email}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {b.status === 'cancelled' ? <Badge tone="red">キャンセル</Badge> : <Badge>終了</Badge>}
                {b.cancellationFeeStatus === 'pending' && (
                  <span className="text-xs text-amber-800">
                    フィー{b.cancellationFeeAmount != null ? ` ${yen(b.cancellationFeeAmount)}` : ''} 未払い
                  </span>
                )}
                {b.cancellationFeeStatus === 'pending' && (
                  <label className="text-xs text-stone-600 flex items-center gap-1">
                    支払い方法
                    <select
                      className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs"
                      value={b.cancellationFeeMethod ?? ''}
                      aria-label="支払い方法を変更"
                      onChange={(e) => api.changeFeeMethod(host.id, b.id, e.target.value as FeeMethod).then(load).catch(setError)}
                    >
                      {!b.cancellationFeeMethod && <option value="">未指定</option>}
                      {[...new Set([...(b.cancellationFeeMethod ? [b.cancellationFeeMethod] : []), ...methods])].map((m) => (
                        <option key={m} value={m}>{methodLabel(m)}</option>
                      ))}
                    </select>
                  </label>
                )}
                {b.cancellationFeeStatus === 'pending' && (
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    onClick={() => api.markFeePaid(host.id, b.id).then(load).catch(setError)}
                  >
                    フィー入金を確認
                  </button>
                )}
                {b.cancellationFeeStatus === 'paid' && <Badge tone="green">フィー支払済</Badge>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- 設定 ----------

function SettingsTab({
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
  const [feeInput, setFeeInput] = useState<string>(host.cancellationFeeAmount != null ? String(host.cancellationFeeAmount) : '');
  const [feeSaved, setFeeSaved] = useState(false);
  const [feeMethods, setFeeMethods] = useState<FeeMethod[]>(host.feeMethods);
  const [bankInfo, setBankInfo] = useState(host.bankTransferInfo);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    displayName: host.displayName,
    slug: host.slug,
    bio: host.bio,
    lessonMinutes: host.lessonMinutes,
    minLeadMinutes: host.minLeadMinutes,
  });
  const [win, setWin] = useState({ weekday: 1, startTime: '10:00', endTime: '18:00' });
  const [cal, setCal] = useState<{ calendarId: string; label: string; role: HostCalendar['role'] }>({ calendarId: '', label: '', role: 'busy_source' });

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

  const run = (p: Promise<unknown>) => p.then(load).catch(setError);
  const hasWriteTarget = calendars?.some((c) => c.role === 'write_target') ?? false;
  const publicUrl = billing?.publicUrl ?? `${window.location.origin}${window.location.pathname}#/h/${host.slug}`;
  const hereUrl = `${window.location.origin}${window.location.pathname}#/host`;
  const proPlan = rules.plans.find((p) => p.plan === 'pro');
  const freePlan = rules.plans.find((p) => p.plan === 'free');

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

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">プラン</h2>
          {billing && <Badge tone={billing.effectivePlan === 'pro' ? 'green' : 'neutral'}>{billing.planLabel}</Badge>}
        </div>
        {billing === null ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-stone-50 p-2">
                <div className="text-xs text-stone-500">今月の予約</div>
                <div className="font-medium">{billing.usage.bookingsThisMonth}{billing.limits.maxBookingsPerMonth !== null ? ` / ${billing.limits.maxBookingsPerMonth}件` : '件(無制限)'}</div>
              </div>
              <div className="rounded-lg bg-stone-50 p-2">
                <div className="text-xs text-stone-500">連携カレンダー</div>
                <div className="font-medium">{billing.usage.calendars}{billing.limits.maxCalendars !== null ? ` / ${billing.limits.maxCalendars}件` : '件(無制限)'}</div>
              </div>
            </div>
            {billing.subscriptionStatus === 'past_due' && (
              <Notice tone="warn">お支払いが確認できていません。支払い方法を更新するまでフリープランの上限が適用されます。</Notice>
            )}
            {billing.viaOrganization ? (
              <Notice tone="success">教室プランで利用中です。契約の管理は教室の管理者が行います。</Notice>
            ) : billing.effectivePlan === 'free' ? (
              <div className="space-y-2">
                <Notice>
                  フリー: 月{freePlan?.limits.maxBookingsPerMonth}件まで・カレンダー{freePlan?.limits.maxCalendars}件・予約のカレンダー書き込みなし。
                  プロ: 予約数・カレンダー数無制限、予約を Google カレンダーに自動登録。
                </Notice>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    api
                      .checkout(host.id, hereUrl, hereUrl)
                      .then(({ url }) => {
                        window.location.href = url;
                      })
                      .catch(setError)
                  }
                >
                  {proPlan?.label ?? 'プロ'}プランにアップグレード
                </button>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    api
                      .billingPortal(host.id, hereUrl)
                      .then(({ url }) => {
                        window.location.href = url;
                      })
                      .catch(setError)
                  }
                >
                  支払い方法・解約の管理
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">キャンセルフィー</h2>
        <p className="text-xs text-stone-600">
          生徒が直前のキャンセル申請で「キャンセルフィーを支払う」を選び、あなたが承認したときの金額です。承認した時点の金額が請求されます。空欄にすると金額は表示せず、支払いは個別にやり取りします。
        </p>
        <div>
          <label className="label" htmlFor="fee-amount">金額(円)</label>
          <input id="fee-amount" className="input" type="number" min={50} step={100} value={feeInput} onChange={(e) => setFeeInput(e.target.value)} placeholder="例: 3000" />
        </div>
        <fieldset>
          <legend className="label">受け付ける支払い方法(生徒が申請時に選び、あなたが承認します)</legend>
          <div className="space-y-1">
            {rules.feeMethods.map((m) => (
              <label key={m.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={feeMethods.includes(m.value)}
                  onChange={(e) => setFeeMethods(e.target.checked ? [...feeMethods, m.value] : feeMethods.filter((x) => x !== m.value))}
                />
                {m.label}
                {m.value === 'card' && !connect?.active && <span className="text-xs text-stone-500">(下の Stripe 連携が完了すると選べるようになります)</span>}
                {m.value === 'bank_transfer' && !bankInfo.trim() && <span className="text-xs text-stone-500">(振込先の入力が必要です)</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {feeMethods.includes('bank_transfer') && (
          <div>
            <label className="label" htmlFor="bank-info">振込先(承認後、その生徒にだけ表示されます)</label>
            <textarea
              id="bank-info"
              className="input min-h-16"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder={'例: ○○銀行 △△支店 普通 1234567\n名義: スズキ ハナコ'}
            />
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              api
                .updateHost(host.id, {
                  cancellationFeeAmount: feeInput.trim() === '' ? null : Number(feeInput),
                  feeMethods,
                  bankTransferInfo: bankInfo,
                })
                .then((h) => {
                  onHostUpdated(h);
                  setFeeSaved(true);
                  setTimeout(() => setFeeSaved(false), 1500);
                  load();
                })
                .catch(setError)
            }
          >
            {feeSaved ? '保存しました' : '保存'}
          </button>
        </div>
        <div className="border-t border-stone-100 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">オンライン決済(Stripe)</span>
            {connect?.active ? <Badge tone="green">受付中</Badge> : connect?.accountId ? <Badge tone="amber">手続き未完了</Badge> : <Badge>未連携</Badge>}
          </div>
          {connect === null ? (
            <Spinner />
          ) : !connect.available ? (
            <Notice>プロプランでは、あなたの Stripe アカウントを連携して、生徒にカードでキャンセルフィーを払ってもらえます。売上はあなたの口座に直接入金されます。</Notice>
          ) : connect.active ? (
            <div className="flex items-center justify-between gap-2 text-xs text-stone-600">
              <span>承認後、生徒のマイ予約に「カードで支払う」ボタンが表示されます。売上はあなたの Stripe アカウントに入り、Stripe の決済手数料がかかります。</span>
              <button type="button" className="text-red-700 underline whitespace-nowrap" onClick={() => run(api.connectDisconnect(host.id))}>連携を外す</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-600">
                あなた名義の Stripe アカウントを作成(または既存のアカウントでログイン)し、本人確認と入金口座を登録します。運営者は売上を預からず、手数料も取りません。
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  api
                    .connectOnboarding(host.id, hereUrl, hereUrl)
                    .then(({ url }) => {
                      window.location.href = url;
                    })
                    .catch(setError)
                }
              >
                {connect.accountId ? 'Stripe の手続きを続ける' : 'Stripe と連携する'}
              </button>
            </div>
          )}
        </div>
      </section>

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
          <button type="button" className="btn-primary" onClick={() => api.updateHost(host.id, form).then((h) => { onHostUpdated(h); load(); }).catch(setError)}>保存</button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Google カレンダー連携</h2>
        {google === null ? (
          <Spinner />
        ) : google.connected ? (
          <div className="flex items-center justify-between">
            <Badge tone="green">連携済み</Badge>
            <button type="button" className="btn-danger" onClick={() => run(api.googleDisconnect(host.id))}>連携を解除</button>
          </div>
        ) : (
          <div className="space-y-2">
            <Notice tone="warn">未連携です。連携すると、登録したカレンダーの予定を空き枠から除外し、予約をカレンダーに書き込めます。</Notice>
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                api
                  .googleConnectUrl(host.id)
                  .then(({ url }) => {
                    window.location.href = url;
                  })
                  .catch(setError)
              }
            >
              Google と連携する
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">連携カレンダー</h2>
        {billing?.effectivePlan === 'free' && (
          <Notice tone="warn">フリープランでは予定の参照のみ行い、予約イベントの自動作成はプロプランで有効になります。</Notice>
        )}
        <p className="text-xs text-stone-600">
          「書き込み先」は予約イベントを作成するカレンダー(1件)。「参照のみ」は予定を空き枠から除外するだけのカレンダー(複数可)。どちらも予定がある時間は空き枠から外れます。
        </p>
        {calendars === null ? <Spinner /> : (
          <ul className="divide-y divide-stone-100">
            {calendars.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{c.label || c.calendarId}</span>
                  {c.label && <span className="ml-2 text-xs text-stone-500">{c.calendarId}</span>}
                  <span className="ml-2"><Badge tone={c.role === 'write_target' ? 'green' : 'neutral'}>{c.role === 'write_target' ? '書き込み先' : '参照のみ'}</Badge></span>
                </div>
                <button type="button" className="text-xs text-red-700 underline" onClick={() => run(api.removeCalendar(host.id, c.id))}>解除</button>
              </li>
            ))}
            {calendars.length === 0 && <li className="py-2 text-sm text-stone-500">まだ登録されていません。</li>}
          </ul>
        )}
        <form
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(api.addCalendar(host.id, { calendarId: cal.calendarId.trim(), label: cal.label.trim(), role: cal.role }).then(() => setCal({ calendarId: '', label: '', role: 'busy_source' })));
          }}
        >
          <div>
            <label className="label" htmlFor="c-id">カレンダーID</label>
            <input id="c-id" className="input" placeholder="primary または xxx@group.calendar.google.com" value={cal.calendarId} onChange={(e) => setCal({ ...cal, calendarId: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="c-label">表示名</label>
            <input id="c-label" className="input" placeholder="例: 教室" value={cal.label} onChange={(e) => setCal({ ...cal, label: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="c-role">用途</label>
            <select id="c-role" className="input" value={cal.role} onChange={(e) => setCal({ ...cal, role: e.target.value as HostCalendar['role'] })}>
              <option value="busy_source">参照のみ</option>
              <option value="write_target" disabled={hasWriteTarget}>書き込み先</option>
            </select>
          </div>
          <button type="submit" className="btn-secondary">追加</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">営業時間枠(曜日ごと)</h2>
        <p className="text-xs text-stone-600">この時間帯の中からレッスン長で枠を切り出します。同じ曜日に複数登録できます(例: 10:00-12:00 と 14:00-18:00)。</p>
        {windows === null ? <Spinner /> : (
          <ul className="divide-y divide-stone-100">
            {[...windows].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <span><b>{WEEKDAY_JA[w.weekday]}</b> {w.startTime} – {w.endTime}</span>
                <button type="button" className="text-xs text-red-700 underline" onClick={() => run(api.removeWindow(host.id, w.id))}>削除</button>
              </li>
            ))}
            {windows.length === 0 && <li className="py-2 text-sm text-stone-500">まだ登録されていません。登録するまで空き枠は表示されません。</li>}
          </ul>
        )}
        <form
          className="grid grid-cols-2 sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(api.addWindow(host.id, win));
          }}
        >
          <div>
            <label className="label" htmlFor="w-day">曜日</label>
            <select id="w-day" className="input" value={win.weekday} onChange={(e) => setWin({ ...win, weekday: Number(e.target.value) })}>
              {WEEKDAY_JA.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="w-start">開始</label>
            <input id="w-start" className="input" type="time" step={900} value={win.startTime} onChange={(e) => setWin({ ...win, startTime: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="w-end">終了</label>
            <input id="w-end" className="input" type="time" step={900} value={win.endTime} onChange={(e) => setWin({ ...win, endTime: e.target.value })} required />
          </div>
          <button type="submit" className="btn-secondary col-span-2 sm:col-span-1">追加</button>
        </form>
      </section>

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

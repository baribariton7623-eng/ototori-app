import { api } from '../../../api/client';
import type { BillingInfo, Host, Rules } from '../../../api/types';
import { Badge, Notice, Spinner } from '../../../components/ui';

/** プラン(利用状況・アップグレード・契約の管理) */
export function PlanSection({ host, rules, billing, returnUrl, onError }: { host: Host; rules: Rules; billing: BillingInfo | null; returnUrl: string; onError: (e: unknown) => void }) {
  const proPlan = rules.plans.find((p) => p.plan === 'pro');
  const freePlan = rules.plans.find((p) => p.plan === 'free');
  return (
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
                    .checkout(host.id, returnUrl, returnUrl)
                    .then(({ url }) => {
                      window.location.href = url;
                    })
                    .catch(onError)
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
                    .billingPortal(host.id, returnUrl)
                    .then(({ url }) => {
                      window.location.href = url;
                    })
                    .catch(onError)
                }
              >
                支払い方法・解約の管理
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

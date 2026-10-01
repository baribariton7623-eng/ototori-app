import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Host, MyInvitation, MyOrganization } from '../../api/types';
import { Badge, ErrorBanner, Modal, Notice, Spinner } from '../../components/ui';
import { operator } from '../../legal/operator';

const STATUS_JA = { none: '未契約', active: '契約中', past_due: '支払い遅延', canceled: '解約済み' } as const;

/** 講師画面の「教室」タブ。未所属なら招待への返答と教室作成、所属中なら教室の情報と管理 */
export function OrgTab({ host, onChanged }: { host: Host; onChanged: () => void }) {
  const [mine, setMine] = useState<MyOrganization | null | undefined>(undefined);
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    api.myOrganization().then(setMine).catch(setError);
    api.myInvitations().then(setInvitations).catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load, host.organizationId]);

  const run = (p: Promise<unknown>) =>
    p
      .then(() => {
        load();
        onChanged();
      })
      .catch(setError);

  if (mine === undefined) return <Spinner />;

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {mine === null ? (
        <>
          {invitations.length > 0 && (
            <section className="card space-y-2 border-emerald-300">
              <h2 className="font-semibold">届いている招待</h2>
              {invitations.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>教室「<b>{i.organizationName}</b>」</span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary py-1" onClick={() => run(api.declineInvitation(i.id))}>断る</button>
                    <button type="button" className="btn-primary py-1" onClick={() => run(api.acceptInvitation(i.id))}>参加する</button>
                  </span>
                </div>
              ))}
              {host.plan === 'pro' && host.subscriptionStatus === 'active' && (
                <p className="text-xs text-amber-800">教室が契約中なら、参加後は個人のプロプランが不要になります。二重に支払わないよう、参加後に個人の契約を解約してください。</p>
              )}
            </section>
          )}
          <CreateOrg onCreated={() => run(Promise.resolve())} setError={setError} />
        </>
      ) : (
        <MyOrg data={mine} run={run} setError={setError} />
      )}
    </div>
  );
}

function CreateOrg({ onCreated, setError }: { onCreated: () => void; setError: (e: unknown) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        api.createOrg({ name: name.trim(), slug: slug.trim(), bio: bio.trim() || undefined }).then(onCreated).catch(setError);
      }}
    >
      <h2 className="font-semibold">教室を作る</h2>
      <Notice>
        複数の講師がいる教室向けのプランです。講師を招待して、まとめて契約できます{operator.orgSeatPrice ? `(${operator.orgSeatPrice})` : ''}。
        契約中は所属講師全員がプロプランの機能を使えます。各講師の予約や生徒の情報は、管理者を含め他の講師には共有されません。
      </Notice>
      <div>
        <label className="label" htmlFor="org-name">教室名</label>
        <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="org-slug">教室ページの URL 名(英小文字・数字・ハイフン)</label>
        <input id="org-slug" className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} pattern="[a-z0-9\-]{3,32}" required placeholder="例: sakura-music" />
      </div>
      <div>
        <label className="label" htmlFor="org-bio">紹介文(任意)</label>
        <textarea id="org-bio" className="input min-h-16" value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <button type="submit" className="btn-primary">作成する</button>
      </div>
    </form>
  );
}

function MyOrg({
  data,
  run,
  setError,
}: {
  data: MyOrganization;
  run: (p: Promise<unknown>) => void;
  setError: (e: unknown) => void;
}) {
  const { organization: org, isOwner } = data;
  const [invite, setInvite] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [edit, setEdit] = useState({ name: org.name, slug: org.slug, bio: org.bio });
  const hereUrl = `${window.location.origin}/#/host`;

  return (
    <>
      <section className="card space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{org.name}</h2>
            <div className="text-xs text-stone-500">{isOwner ? 'あなたは管理者です' : '所属講師として参加中'}</div>
          </div>
          <Badge tone={org.subscriptionStatus === 'active' ? 'green' : org.subscriptionStatus === 'past_due' ? 'amber' : 'neutral'}>
            教室プラン: {STATUS_JA[org.subscriptionStatus]}
          </Badge>
        </div>
        <div className="flex gap-2 items-center">
          <input className="input font-mono text-xs" readOnly value={data.publicUrl} aria-label="教室ページURL" onFocus={(e) => e.currentTarget.select()} />
          <a className="btn-secondary whitespace-nowrap" href={data.publicUrl} target="_blank" rel="noreferrer">開く</a>
        </div>
        <p className="text-xs text-stone-600">教室ページには所属講師の一覧が表示され、各講師の予約ページに進めます。</p>
      </section>

      {isOwner && (
        <section className="card space-y-2">
          <h2 className="font-semibold">契約</h2>
          {org.subscriptionStatus === 'active' ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">所属講師 {data.members.length} 人分で契約中です。人数の増減は自動で反映されます(日割り)。</span>
              <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => api.orgPortal(org.id, hereUrl).then(({ url }) => { window.location.href = url; }).catch(setError)}>
                支払い・解約の管理
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {org.subscriptionStatus === 'past_due' && <Notice tone="warn">お支払いが確認できていません。所属講師はフリープランの上限に戻っています。</Notice>}
              <p className="text-sm">
                所属講師 {data.members.length} 人分で契約します{operator.orgSeatPrice ? `(${operator.orgSeatPrice})` : ''}。
              </p>
              <button type="button" className="btn-primary" onClick={() => api.orgCheckout(org.id, hereUrl, hereUrl).then(({ url }) => { window.location.href = url; }).catch(setError)}>
                教室プランを契約する
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">所属講師({data.members.length})</h2>
        <ul className="divide-y divide-stone-100">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <a className="font-medium underline" href={`/#/h/${m.slug}`}>{m.displayName}</a>
                {m.isOwner && <span className="ml-2"><Badge>管理者</Badge></span>}
                {m.email && <div className="text-xs text-stone-500">{m.email}</div>}
              </div>
              {isOwner && !m.isOwner && (
                <button type="button" className="text-xs text-red-700 underline" onClick={() => run(api.removeMember(org.id, m.id))}>外す</button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <>
            <form
              className="flex gap-2 items-end pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(api.inviteToOrg(org.id, invite.trim()).then(() => setInvite('')));
              }}
            >
              <div className="flex-1">
                <label className="label" htmlFor="invite-email">講師を招待(メールアドレス)</label>
                <input id="invite-email" className="input" type="email" value={invite} onChange={(e) => setInvite(e.target.value)} required />
              </div>
              <button type="submit" className="btn-secondary">招待する</button>
            </form>
            {data.invitations.length > 0 && (
              <div className="text-xs text-stone-600 space-y-1">
                <div className="font-medium">招待中</div>
                {data.invitations.map((i) => (
                  <div key={i.id} className="flex items-center justify-between">
                    <span>{i.email}</span>
                    <button type="button" className="text-red-700 underline" onClick={() => run(api.revokeInvitation(org.id, i.id))}>取り消す</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {isOwner ? (
        <>
          <section className="card space-y-2">
            <h2 className="font-semibold">教室の情報</h2>
            <div>
              <label className="label" htmlFor="oe-name">教室名</label>
              <input id="oe-name" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="oe-slug">URL 名</label>
              <input id="oe-slug" className="input font-mono" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <label className="label" htmlFor="oe-bio">紹介文</label>
              <textarea id="oe-bio" className="input min-h-16" value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={() => run(api.updateOrg(org.id, edit))}>保存</button>
            </div>
          </section>
          <section className="card space-y-2 border-red-200">
            <h2 className="font-semibold text-red-800">教室を削除</h2>
            <p className="text-xs text-stone-700">教室プランは即時に解約され、所属講師は全員フリープラン(または各自の個人契約)に戻ります。各講師の予約はそのまま残ります。</p>
            <div className="flex justify-end">
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>教室を削除する</button>
            </div>
          </section>
        </>
      ) : (
        <section className="card space-y-2">
          <h2 className="font-semibold">教室から抜ける</h2>
          <p className="text-xs text-stone-700">抜けると教室プランの機能は使えなくなります(個人でプロプランを契約していればそのまま使えます)。予約はそのまま残ります。</p>
          <div className="flex justify-end">
            <button type="button" className="btn-danger" onClick={() => run(api.leaveOrg())}>抜ける</button>
          </div>
        </section>
      )}

      {confirmDelete && (
        <Modal title="教室の削除" onClose={() => setConfirmDelete(false)}>
          <div className="space-y-3">
            <p className="text-sm">「{org.name}」を削除します。この操作は取り消せません。</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>やめる</button>
              <button
                type="button"
                className="btn bg-red-700 text-white hover:bg-red-800"
                onClick={() => {
                  setConfirmDelete(false);
                  run(api.deleteOrg(org.id));
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

interface HelpGuideProps {
  onClose: () => void;
}

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: '1. 曲を選ぶ',
    body: 'トップ画面で作曲家名・曲名を検索するか、一覧から作曲家を選び、作品→楽章の順に進んでください。',
  },
  {
    title: '2. 再生する',
    body: '中央の大きな再生ボタンで全パートを再生します。スマホでは初回のみ「タップして音取りを開始」の画面が出るので、タップしてください。',
  },
  {
    title: '3. パートごとに調整する',
    body: '各パートの「再生中」ボタンでミュート、スライダーで音量を調整できます。自分のパートを大きく、他パートを小さくして音を取る練習ができます。',
  },
  {
    title: '4. テンポを変える',
    body: '「♩=」の数値やスライダーでテンポを変更できます(基準テンポの50%〜150%)。ゆっくり確認してから本来のテンポへ、という使い方ができます。',
  },
  {
    title: '5. 好きな位置に移動する',
    body: '小節番号のシークバー、または「◀◀4」「4▶▶」ボタンで4小節単位に移動できます。',
  },
  {
    title: '6. 苦手な箇所を繰り返す(A-Bリピート)',
    body: '「開始」「終了」の小節番号を指定して「ループ開始」を押すと、その区間を頭から繰り返し再生します。「現在位置」ボタンで今いる小節を素早く指定できます。',
  },
  {
    title: '7. ログイン(任意)',
    body: 'ログインしなくてもすべての機能が使えます。お気に入り・ミュート設定・練習履歴を保存したい場合のみ、右上からログインしてください。',
  },
];

export default function HelpGuide({ onClose }: HelpGuideProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md space-y-5 overflow-y-auto rounded-3xl border border-hairline bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold tracking-tight text-ink">音取りアプリの使い方</h2>

        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-1">
            <h3 className="text-base font-semibold text-accent-dark">{section.title}</h3>
            <p className="text-sm leading-relaxed text-ink-soft">{section.body}</p>
          </section>
        ))}

        <button
          onClick={onClose}
          className="h-12 w-full rounded-full bg-accent text-base font-semibold text-paper transition hover:bg-accent-dark active:scale-95"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

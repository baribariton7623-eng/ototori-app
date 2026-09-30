/** 未ログインでトップを開いたときの案内 */
export function LandingScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-8 space-y-4">
      <div className="card space-y-2">
        <h1 className="text-xl font-semibold">レッスン予約</h1>
        <p className="text-sm text-stone-700">
          講師の Google カレンダーと連携した予約ページ。生徒は空き枠から予約し、直前のキャンセル・変更は講師の承認制で管理できます。
        </p>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">生徒の方</h2>
        <p className="text-sm text-stone-700">講師から共有された予約ページのリンクを開いてください。予約の確認・変更はログイン後の「マイ予約」から行えます。</p>
        <button type="button" className="btn-secondary" onClick={onLogin}>ログインしてマイ予約を見る</button>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">講師の方</h2>
        <p className="text-sm text-stone-700">ログイン後「講師の方」から登録すると、あなた専用の予約ページ URL が発行されます。フリープランで始められます。</p>
        <button type="button" className="btn-primary" onClick={onLogin}>ログインして予約ページを作る</button>
      </div>
    </div>
  );
}

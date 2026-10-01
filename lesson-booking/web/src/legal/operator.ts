/**
 * 運営者情報。法務ページ(特商法表記・規約・ポリシー)に差し込む。
 * 値はビルド時の環境変数(web/.env)から読む。未設定の項目は画面上で赤字の「未設定」になる。
 */
const env = import.meta.env;

function v(key: string): string | null {
  const raw = (env as Record<string, string | undefined>)[key];
  return raw && raw.trim() ? raw.trim() : null;
}

export const operator = {
  serviceName: v('VITE_SERVICE_NAME') ?? 'レッスン予約',
  /** 販売事業者(個人事業主なら屋号または氏名、法人なら法人名) */
  name: v('VITE_OPERATOR_NAME'),
  /** 運営統括責任者 */
  representative: v('VITE_OPERATOR_REPRESENTATIVE'),
  /** 所在地。個人の場合は「請求があった場合には遅滞なく開示いたします」も可 */
  address: v('VITE_OPERATOR_ADDRESS'),
  /** 電話番号。個人の場合は所在地と同様の記載も可 */
  phone: v('VITE_OPERATOR_PHONE'),
  /** 問い合わせ用メールアドレス */
  email: v('VITE_OPERATOR_EMAIL'),
  /** プロプランの表示価格(例: 月額1,480円(税込)) */
  proPrice: v('VITE_PRO_PRICE'),
  /** 教室プランの表示価格(例: 講師1人あたり月額1,280円(税込)) */
  orgSeatPrice: v('VITE_ORG_SEAT_PRICE'),
  /** 法務ページの施行日(例: 2026年11月1日) */
  effectiveDate: v('VITE_LEGAL_EFFECTIVE_DATE'),
};

export type OperatorKey = Exclude<keyof typeof operator, 'serviceName'>;

export const OPERATOR_ENV: Record<OperatorKey, string> = {
  name: 'VITE_OPERATOR_NAME',
  representative: 'VITE_OPERATOR_REPRESENTATIVE',
  address: 'VITE_OPERATOR_ADDRESS',
  phone: 'VITE_OPERATOR_PHONE',
  email: 'VITE_OPERATOR_EMAIL',
  proPrice: 'VITE_PRO_PRICE',
  orgSeatPrice: 'VITE_ORG_SEAT_PRICE',
  effectiveDate: 'VITE_LEGAL_EFFECTIVE_DATE',
};

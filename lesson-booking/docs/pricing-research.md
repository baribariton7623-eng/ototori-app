# 無料枠を広げ、承認制キャンセルで課金する

結論から言うと、現行案のうち**プロの価格帯(税込980〜1,980円)と、カード決済をプロ限定にする線引きは競合と比べて妥当**です。一方で**フリーの「月10件」は、比較したどの競合よりも狭すぎます**。国内の予約SaaSは、無料プランで月50件(STORES予約・RESERVA)か件数無制限(Airリザーブ・Square予約・TimeRex)を出しています。週1回レッスンの個人講師は月40〜120件の予約を抱えるのが普通です。月10件では生徒2〜3人分しか入らず、本サービスの差別化点である「直前キャンセルの3択申請と講師承認」を無料期間中に一度も体験しないまま離脱する講師が出ます。推奨案は次のとおりです。フリーは**月30件・カレンダー読み取り1件・予約のGoogleカレンダー書き込みあり**に広げます。プロは**月1,480円/年14,800円(税込)**とし、**無制限・複数カレンダー・カードでのキャンセルフィー徴収**で有料化します。教室プランは**1講師980円(税込)・最低3席**に下げます。小規模教室はSquare予約プラス(1店舗3,000円、スタッフ数は問わない)と比べて選ぶため、現行の1席1,280円では3人目の時点で割高になるからです。Stripe Connectは今のStandardアカウント+Direct chargeのまま使えば、運営側の追加原価はゼロです。プラットフォーム手数料を取っても、得られるのは講師1人あたり月数十円にとどまり、法務上のリスクに見合いません。粗利を左右するのは決済手数料ではなく、消費税・サブスク自体のStripe手数料・インフラ費です。

> **出典についての注意(必読)** 競合の価格・制限・手数料は、ほぼすべて**Web検索結果の要約(スニペット)**から得た数字です。調査環境のプロキシが各社の公式料金ページ(stores.fun、reserva.be、select-type.com、timerex.net、jicoo.com、calendly.com、acuityscheduling.com、mymusicstaff.com、stripe.com など)への直接アクセスを遮断したため、ページ本文は読めていません。税込/税抜、月払い/年払いの取り違えや、改定前の数字が混じっている可能性があります。食い違いが分かっているもの(Jicoo、SimplyBook.me、Setmore、Acuity、Airリザーブ無料プランの決済可否、Square予約の後払い手数料率など)は本文に明記しました。**料金表や営業資料に引用する前に、必ず各社の公式ページで確認し直してください。** 本サービス自身の条件は、リポジトリ内の [plans.ts](../src/domain/plans.ts) と [business.md](../docs/business.md) によります。

## 国内の無料枠は「月50件」か「無制限」で、月10件は突出して狭い

国内の予約SaaSの無料プランは、件数で絞る型と、件数は無制限で機能を絞る型に分かれます。前者の代表がSTORES予約とRESERVAで、どちらも**フリーは月50件まで**です。STORES予約はその上の有料プランが**スモール9,790円/月(年契約、税込)**と高く、一気に価格が跳ね上がります([STORES予約 料金](https://stores.fun/reserve/pricing))。RESERVAは**ブルー3,850円(年払い)/5,500円(月払い)**と段差が緩やかです([RESERVA 料金](https://biz.reserva.be/price/))。後者の代表はAirリザーブとSquare予約で、無料プランでも**予約件数は無制限**です。そのかわり、Googleカレンダー連携やリマインド、無断キャンセル対策を有料プランに回しています(Airリザーブ ベーシック5,500円、Square予約 プラス3,000円/店舗)([Airリザーブ 料金](https://airregi.jp/reserve/cost/)、[Square予約 FAQ](https://squareup.com/jp/ja/appointments/faq))。日程調整ツールのTimeRexとJicooは1対1の予約を無料で無制限に受け付けます。有料は1人あたり**TimeRex 750円(年払い)/900円(月払い)、税抜**、**Jicoo Pro 800円**です。ただしJicooは旧価格(Pro 1,100円)を載せた資料も残っています([TimeRex ヘルプ](https://help.timerex.net/ja/articles/10000405)、[Jicoo 料金](https://www.jicoo.com/en/pricing))。SelectTypeは件数ではなく「**予約を受け付けられるのは7日先まで**」という制限でベーシック(1,650円、税込)への移行を促しており、月単位で予約を取る講師にとっては見落としやすい制約です([SelectType 料金](https://select-type.com/price.php)、[orend](https://orend.jp/mag/a0872))。

海外勢も同じ傾向です。SimplyBook.meのフリーは**月50件**です([koalendar](https://koalendar.com/blog/simplybook-me-pricing))。Setmoreのフリーは**4ユーザー・月200件**まで使えます([koalendar](https://koalendar.com/blog/setmore-pricing))。Calendlyは件数ではなく**イベントタイプ1つ・連携カレンダー1件・決済なし**という機能で絞り、Standardは**1席あたり10ドル(年払い)/12ドル(月払い)**です([usecarly](https://www.usecarly.com/blog/calendly-pricing/)、[costbench](https://costbench.com/software/scheduling/calendly/free-plan/))。Cal.comは無料プランでもStripe決済まで使えます([schedulingkit](https://schedulingkit.com/pricing-guides/cal-com-pricing))。音楽講師向けの教室管理ソフトは無料プランを置かず、全機能入りの単一プランを月10〜20ドルで売る形が中心です。My Music StaffとTutorBirdは**16.95ドル+追加講師1人ごとに4.95ドル**、Duetは**9ドル/月または109ドル/年**です([Capterra MMS](https://www.capterra.com/p/148451/My-Music-Staff/)、[Capterra Duet](https://www.capterra.com/p/276718/Duet-Partner/))。国内の音楽教室向けでは、L-CLEFが**ミニ1,078円(生徒15名まで)**、STAR RESERVEが**2,750円から**です([L-CLEF](https://l-clef.com/)、[tol magazine](https://tol-app.jp/columns/6884))。

| サービス | 無料プランの主な制限 | 最初の有料プラン | 備考・出典 |
|---|---|---|---|
| **本サービス(現行)** | 月10件(レッスン日基準)、連携カレンダー1件、予約のカレンダー書き込みなし、カード決済なし | プロ 目安980〜1,980円(税込) | [plans.ts](../src/domain/plans.ts)、[business.md](../docs/business.md) |
| STORES予約 | 月50件、予約ページ2つ | スモール 9,790円(年)/12,980円(月)、税込、月200件 | 最低契約3か月。超過は50件ごとに1,078円 [公式](https://stores.fun/reserve/pricing) |
| RESERVA | 月50件、顧客250名 | ブルー 3,850円(年)/5,500円(月)、税込 | 税込かどうかは要確認 [公式](https://biz.reserva.be/price/) |
| SelectType | 広告表示、受付は7日先まで | ベーシック 1,650円、税込 | [公式](https://select-type.com/price.php) |
| Airリザーブ | 件数無制限 | ベーシック 5,500円、税込 | リマインド・Google連携はベーシックから [公式](https://airregi.jp/reserve/cost/) |
| Square予約 | 件数無制限、スタッフ1名 | プラス 3,000円/店舗 | 複数スタッフ・無断キャンセル対策・Google連携 [公式](https://squareup.com/jp/ja/press/square-appointments-japan) |
| TimeRex | 予定を考慮できるのは2名まで | 750円(年)/900円(月)/人、税抜 | [公式](https://help.timerex.net/ja/articles/10000405) |
| Jicoo | ほぼ無制限(1対1) | Pro 800円/人 | 旧価格1,100円の資料あり [公式](https://www.jicoo.com/en/pricing) |
| freee予約 | 件数・機能の上限なし(第三者情報) | Business 3,180円(年)/3,980円(月) | [公式](https://tol-app.jp/plan) |
| Calendly | イベントタイプ1つ・カレンダー1件・決済なし | Standard 10ドル(年)/12ドル(月)/席 | 2026年8月に「Plus」プランが追加されたとの単一情報源あり(未確認) [usecarly](https://www.usecarly.com/blog/calendly-pricing/) |
| Cal.com | 1ユーザー。決済・カレンダー連携も無料 | Teams 約12ドル/人(年) | [schedulingkit](https://schedulingkit.com/pricing-guides/cal-com-pricing) |
| Zoho Bookings | 1ユーザー・1サービス | 720円(年)/960円(月)/スタッフ | 円建て [公式](https://www.zoho.com/jp/bookings/pricing.html) |
| My Music Staff | 無料なし(30日試用) | 16.95ドル+4.95ドル/追加講師 | UIは日本語対応との情報あり [Capterra](https://www.capterra.com/p/148451/My-Music-Staff/) |
| L-CLEF | — | ミニ 1,078円(生徒15名) | 振替・欠席管理あり [公式](https://l-clef.com/) |

この比較から見ると、月10件は**全サービス中で最も狭い無料枠**です。講師の実際の予約量と照らすと、狭すぎることがはっきりします。個人ピアノ教室の生徒数は**「10〜19人」が28.7%で最も多く、「20〜29人」が24.7%で続きます**(2014年調査、n=714)([pianoconsul.com](https://www.pianoconsul.com/3265/))。週1回のレッスンなら月40〜120件になります。business.md 自身も月10件を「週2〜3レッスン」相当と書いています([business.md](../docs/business.md))。月謝制で曜日と時間が固定の生徒は毎回予約を入れないこともありますが、本サービスはレッスン1回ごとに予約を立てる設計なので、その例外はあてはまりにくいでしょう。もう一つ見落とせない問題があります。上限に達すると**生徒の予約そのものが「主催者にお問い合わせください」というエラーで拒否されます**([BookingService.ts](../src/services/BookingService.ts) の `assertMonthlyQuota`)。講師にとっては、自分の生徒の前で予約システムが止まるのを見ることになります。STORES予約は上限を超えても50件ごとの追加課金で受付を続けます。拒否方式は、競合にない摩擦です。

反対の立場からの主張にも根拠はあります。無料枠を狭くすれば、本業で使う講師は必ず有料になります。月謝制の講師にとって月額1,000〜3,000円は**売上の約0.5〜4%**にすぎず、払えない額ではありません(月謝相場は[lesson-challenge.com](https://lesson-challenge.com/%E3%83%94%E3%82%A2%E3%83%8E%E6%95%99%E5%AE%A4%E3%81%AE%E6%9C%88%E8%AC%9D%E3%81%AF%E3%81%84%E3%81%8F%E3%82%89%EF%BC%9F%E5%A4%A7%E6%89%8B%E6%95%99%E5%AE%A4%E3%81%A8%E5%80%8B%E4%BA%BA%E6%95%99%E5%AE%A4/))。しかし本サービスの売りは直前キャンセルへの対応で、これは毎回起きるものではありません。月10件では、無料期間に承認フローを一度も通らない講師が多く出ると考えるべきです(キャンセル発生率の定量データは見つからず、これは推論です)。差別化点を体験させる前に上限が来る設計は、無料プランを入口にした集客(business.md の「LP+SEO」)と矛盾します。

## カードでの後払いキャンセル料は3,000円帯の機能で、承認制の振替はどこにもない

競合のキャンセル料の扱いは2通りです。1つは**前払いで受け取り、締切後は返金しない**型で、STORES予約、SelectType、RESERVA、Calendly、Setmoreがこれにあたります。STORES予約では締切前のキャンセルは自動で全額返金、締切後は返金なし(実質100%徴収)で、割合を指定した一部返金の設定は見つかりませんでした([STORES予約 FAQ](https://reserve-faq.stores.jp/hc/ja/articles/28712691138073))。SelectTypeは全額・一部の自動返金に対応しています([SelectType ブログ](https://blog.select-type.com/yoyakuform-tukurikata/refund-setting-upon-cancellation-acceptance2/))。Calendlyはコミュニティで「**キャンセル料やノーショー料を自動化する方法はない**」と回答しており、その穴をHoldlyのような外部アドオンが埋めています([Calendly Community](https://community.calendly.com/how-do-i-40/is-there-a-way-to-charge-a-no-show-fee-or-cancelation-fee-991)、[Holdly](https://getholdly.com/))。もう1つは**カードを登録させ、後から請求する**型です。Square予約は無断キャンセル対策を**プラス(3,000円/店舗)以上**に置いており、オンライン決済の手数料は3.6%です([Square キャンセルポリシーの書き方](https://squareup.com/jp/ja/townsquare/how-to-write-a-cancellation-policy)、[assist-all](https://assist-all.co.jp/salon_reserve/column/20250702-6342/))。Airリザーブは2024年9月から、登録カードへのキャンセル料請求を**3.24%**で提供しています。ただし無料プランで使えるかどうかは情報源によって食い違っています([リクルート プレスリリース](https://www.recruit.co.jp/newsroom/pressrelease/2024/0925_14741.html))。海外ではCal.comの「held payments」(オーソリだけ取っておき、来なければ確定する)が同じ型です([Cal.com blog](https://cal.com/blog/cal-com-s-held-payments-a-useful-tool-for-organizations-offering-free-consultatio))。国内で「カードで後から請求できる」最安の目安は**Square予約プラスの3,000円**で、これが本サービスのプロ価格の上限を決めるアンカーになります。

振替の扱いでは、承認制にしているサービスは見つかりませんでした。STORES予約は振替の回数・期間・クラスをまたぐかどうかをルールで設定し、生徒が自分で振り替えます([STORES 音楽教室](https://stores.jp/reserve/categories/music_lessons))。My Music StaffとOpus1は「締切前のキャンセルなら振替クレジットを自動発行→生徒がポータルで予約し直す→締切後は『欠席・振替なし』として請求」というクレジット型です。学期ごとの発行上限や有効期限を設定でき、講師はあとから手動で上書きできます([MMS ヘルプ](https://support.mymusicstaff.com/en/articles/1178-can-i-limit-how-many-make-up-credits-are-issued)、[Opus1 KB](https://kb.opus1.io/can-i-set-a-makeup-service-credit-to-expire-after-a-certain-time))。SelectType・RESERVA・Square予約が承認制にしているのは**新規予約**だけで、**直前の変更について、生徒が事情を書き、振替の候補日を出し、講師が承認する**という流れは、汎用ツールにも音楽専用ツールにも見つかりませんでした。本サービスの3択申請(承認を求める/期間内の別日に第1〜第3希望で振替/キャンセルフィーを支払う)はこの空白を埋めるものです。

日本の教室の運用もこの設計に合っています。個人教室では「前日までに連絡すれば振替可、当日・無断欠席は1回分消化」が典型です([kanon-piano](https://www.kanon-piano.jp/rule)、[torepia](https://torepia.com/piano-lesson-rules/))。料率を明示する教室では「前日50%・当日100%」や「3日前30%」が見られます([ぷりもぴあっと](https://primopiattomusic.com/cancel-privacy))。一方で、自宅講師が「お金がないのでキャンセル代は払えない」と言われた相談もあり([Yahoo!知恵袋](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1087132570))、講師は請求そのものに心理的な負担を感じています。月謝の前払いが中心の講師にとっては、キャンセル料とはたいてい「振替を認めず消化扱いにする」ことです。別途お金を受け取る必要があるのは、主に**1回ごとに支払うボイトレ・声楽・大人の生徒**です。マンツーマンのボイトレは**1回5,000〜8,000円**が相場なので([interfm](https://www.interfm.co.jp/infomedia/?p=1568))、50%のキャンセル料を1件カードで回収できれば2,500〜4,000円となり、プロの月額を1回で取り戻せます。この点から、**3択申請と振込・手渡しの記録はフリーに残し、カードによるオンライン徴収をプロに置く**現行の線引きは筋が通っています。合唱指導の謝礼(1回5,000〜15,000円、Q&Aサイト由来で信頼度は低め)は団体から受け取るのが一般的で、キャンセル料のカード徴収の需要は小さいと見られます([Yahoo!知恵袋](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12277011212))。

## カレンダー連携の値付けは国内と海外で逆になっている

国内の予約SaaSでは、**予約をGoogleカレンダーに書き込む機能は無料**、**Googleの予定を読んで空き枠から外す機能(双方向)は有料**というのが標準です。STORES予約は書き込みが全プラン、読み取りは**チーム(19,690円)以上**です([STORES Googleカレンダー連携](https://stores.fun/reserve/reserve-function-details/google-calendar))。RESERVAは読み取りを**エンタープライズ以上**に置いています([RESERVA ヘルプ](https://support.reserva.be/hc/ja/articles/38537610965401))。日程調整ツールでは両方向とも無料が基本です。TimeRexは無料でGoogle/Outlookとリアルタイムに同期し([TimeRex ヘルプ](https://help.timerex.net/en/articles/9919380-can-i-use-timerex-for-free))、Cal.comは無料で連携カレンダー数も無制限です([schedulingkit](https://schedulingkit.com/pricing-guides/cal-com-pricing))。有料化の線を**カレンダーの数**で引いているのはCalendlyで、**無料1件、有料6件**です([caroa.jp](https://caroa.jp/article/5e5ehO0C))。

本サービスのフリーは「読み取り1件、書き込みなし」で、国内の標準とは逆の組み合わせです。読み取り(空き枠からの除外)は二重予約を防ぐ中心機能で、これを無料で出しているのは強みです。対して書き込みは、国内でも海外でも無料が当たり前です。比較表で「フリーはGoogleカレンダーに予約が入らない」と書かれると、機能が欠けているように見えます。一方、**複数カレンダーの読み取り**は、合唱指導者や声楽講師にとってプロに払う理由になります。彼らは団の練習予定、勤務先、個人の予定を別々のカレンダーで管理していることが多いからです(講師のカレンダー運用の実態調査は見つからず、推論です)。そこで、カレンダー関連の有料化の線は**書き込みではなく、カレンダーの数**に引くことを勧めます。Calendlyの「1件/複数」と同じ線引きです。

## 席課金の相場は1人700〜1,300円で、小規模教室はSquareの3,000円定額と比べる

複数講師向けの料金体系は4種類あります。1つ目は**1人あたりの席課金**です。TimeRex 750〜1,500円(税抜)、Jicoo 800〜1,200円、Zoho Bookings 720〜1,080円、Calendly Teams 16〜20ドル、Cal.com Teams 約12ドルがこれにあたります([TimeRex ヘルプ](https://help.timerex.net/ja/articles/10000405)、[Zoho 料金](https://www.zoho.com/jp/bookings/pricing.html)、[talkspresso](https://talkspresso.com/blog/how-much-does-calendly-cost-2026))。2つ目は**人数枠込みの定額**です。Acuityは**27ドルで6名**、STORES予約は**チーム19,690円で3名**です([G2 Acuity](https://www.g2.com/products/acuity-scheduling/pricing)、[PRONIアイミツ](https://saas.imitsu.jp/cate-reservation/service/2711))。3つ目は**店舗単位**で、Square予約は**プラス3,000円/店舗**にスタッフ数の制限がありません([assist-all](https://assist-all.co.jp/salon_reserve/column/20250702-6342/))。4つ目は**基本料+追加講師の安い上乗せ**で、My Music Staffは追加講師1人あたり**4.95ドル**です([Capterra MMS](https://www.capterra.com/p/148451/My-Music-Staff/))。スクール向けのhacomono(生徒1人99円から)やComiru(1施設12,000円+生徒数に応じた課金)は、本サービスの対象より大きな規模向けです([hacomono for school](https://school.hacomono.jp/)、[ITreview Comiru](https://www.itreview.jp/products/comiru/price))。

現行の教室プランは**1講師1,280円**で、所属講師全員がプロ相当になります([business.md](../docs/business.md))。講師3人なら3,840円、5人なら6,400円です。2〜5人の小規模な音楽教室にとって最もわかりやすい比較対象は、スタッフ数にかかわらず3,000円のSquare予約プラスです。1,280円/席では3人目の時点でそれを超えます。さらに、現行設計では教室の管理者が他の講師の予約を見られません。つまり教室プランの価値は管理機能ではなく**請求をまとめることと値引き**にあります。値引き幅がプロとの差(1,480円と比べて約13%)しかなければ、教室にとって契約をまとめる理由は弱くなります。席単価を下げ、最低席数で下限を支える方が、市場の相場にも本サービスの機能構成にも合っています。

## Stripe Connect Standardなら追加原価はゼロで、粗利を削るのは決済ではなくインフラ

キャンセルフィーの決済は、講師本人名義のStripe **Standard**アカウントでのDirect chargeです。運営者の口座を資金が通らず、プラットフォーム手数料も取っていません([business.md](../docs/business.md))。Stripe ConnectのStandardアカウントには**追加料金がありません**。運営者が決済を管理するExpress/Customにすると、**稼働中の連結アカウント1件あたり月200円、入金1回あたり250円+0.25%**がかかります([Stripe Connect 料金](https://stripe.com/connect/pricing)、[pay.jp](https://pay.jp/column/stripe-connect-guide))。月1回入金するなら講師1人あたり最低約450円/月で、プロの手取りの3分の1が消えます。オンボーディングを簡単にするためにExpressへ移る案が出ても、この原価を理由に見送るべきです。講師が負担する国内カード決済手数料は**3.6%**です。消費税の扱いによって実質約3.96%になると解説する記事もあります([pay.jp](https://pay.jp/column/stripe-fees-guide)、[classmethod](https://dev.classmethod.jp/articles/stripe-billing-fee-and-tax/))。

キャンセルフィーにかかる講師側の総コストを競合と並べると、本サービスは有利です。STORES予約は2026年8月3日から標準の決済手数料が**5.5%**に上がりました([STORES予約 FAQ](https://reserve-faq.stores.jp/hc/ja/articles/59293042306969))。freee予約のかんたんネット決済は**6%+入金1回250円**です([freee サポート](https://support.freee.co.jp/hc/ja/articles/42642641795865))。RESERVAの前払い決済は**4.9%**です([レゼルバペイメント](https://support.reserva.be/hc/ja/articles/227137508))。Square予約プラスは月額3,000円+3.6%です。本サービスは月額1,480円(推奨案)+Stripeの3.6%なので、カードによる後払い徴収を国内で最も安く使える部類に入ります。海外の音楽講師向けツールでも、決済への上乗せは例外です。My Music Staffは手数料を取らないと明言しており、Calendlyも同様です。確認できた上乗せはDuetの**1%**だけです([MMS blog](https://www.mymusicstaff.com/payment-processing-fees/)、[Calendly Payments FAQ](https://calendly.com/help/payments-faq)、[Duet FAQ](https://www.duetpartner.com/faq))。仮に1%のapplication feeを取っても、3,000円のキャンセルフィーが月2件の講師から得られるのは**月60円**です(仮定に基づく試算)。一方で、business.md が挙げる収納代行・資金移動業との関係を専門家に確認する費用が発生します。手数料ゼロは「講師のお金に手を付けない」という訴求にもなり、そのほうが価値は大きいと考えます。

運営側の粗利を削るのは、消費税・サブスク課金そのもののStripe手数料・インフラ費です。以下は税込価格から消費税(10%)を除き、サブスク代金にStripe 3.6%がかかり、インフラ費を business.md の目安(プロ20契約で原価5千円前後、つまり1契約約250円)とした場合の月あたり試算です。年払いは、14,800円の税抜額13,455円からStripe手数料533円を引いて12で割ると1,077円/月となり、インフラ費を引く前の段階で月払いの1,480円とほぼ同じ水準です。

| 価格(税込/月) | 税抜 | Stripe 3.6% | インフラ(20契約時) | 粗利/契約 | 参考: Expressにした場合 |
|---|---|---|---|---|---|
| 980円 | 891円 | 35円 | 約250円 | 約606円 | 約156円 |
| **1,480円** | 1,345円 | 53円 | 約250円 | **約1,042円** | 約592円 |
| 1,980円 | 1,800円 | 71円 | 約250円 | 約1,479円 | 約1,029円 |
| 教室 980円/席 | 891円 | 35円 | 約250円 | 約606円/席 | — |

980円では、Supabase Pro(約3,700円/月)に移る50契約前後でも、粗利はかろうじて黒字という水準です。サポートにかかる時間を考えると薄すぎます。1,480円であれば、1契約あたり約1,000円の粗利を確保したまま、Square予約プラスの半額以下に収まります。

## 推奨: フリー30件・プロ1,480円・教室980円/席(最低3席)

推奨プランを下の表にまとめます。考え方は3つです。**無料枠の件数は、差別化点(承認制の3択申請)を体験できる量まで広げる**。**有料化の線は「量・カレンダーの数・カード決済」に引く**。**教室プランはSquare予約プラスを意識した価格にする**。

| 項目 | 現行 | 推奨 | 根拠 |
|---|---|---|---|
| フリーの月間予約数 | 10件 | **30件**(生徒7〜8人の週1回相当) | 競合の無料枠は50件か無制限。月10件では差別化点を体験しないまま離脱する |
| 上限到達時の挙動 | 生徒の予約をエラーで拒否 | **80%で講師に通知し、超過月は受付を続けたうえで翌月から制限**(または超過後に猶予+5件) | 生徒の前で予約が止まる体験は講師の信用を損なう。STORESは超過分を追加課金で受け付ける |
| フリーのカレンダー | 読み取り1件、書き込みなし | **読み取り1件+書き込みあり** | 書き込みは国内外とも無料が標準。読み取りの件数で有料化の線を引く |
| 3択申請・承認・振込/手渡しの記録 | フリーで可 | **フリーのまま** | LPの第一メッセージ。体験させないと売れない |
| 前日リマインドメール | 全プラン | **フリーのまま** | Square予約やCal.comは無料で提供。無断キャンセルを減らす効果が講師にも生徒にも届く |
| プロの価格 | 980〜1,980円(目安) | **月1,480円/年14,800円(税込、約17%引き)** | 日程調整ツール(約800〜990円)より上、Square予約プラス(3,000円)の半額以下。年払いの割引率は市場(17〜25%)に合わせる |
| プロの機能 | 無制限・複数カレンダー・書き込み・カード決済 | **件数無制限・複数カレンダー読み取り・カードでのキャンセルフィー徴収**(+任意で予約受付期間31〜60日) | 「カードで後から請求」は国内では3,000円帯の機能。SelectTypeは予約受付期間で有料化している |
| 教室プラン | 1,280円/席 | **980円/席(税込)、最低3席(2,940円から)、年払い9,800円/席** | 3人でSquare予約プラス(3,000円)と同水準。最低3席にすることで、個人講師がプロより安く使う抜け道を塞ぐ |
| キャンセルフィーの決済 | Connect Standard、手数料なし | **Standardを維持し、application feeは取らない** | Expressは1講師あたり月約450円の原価。1%を取っても月数十円で、法務コストに見合わない |
| 価格改定の進め方 | — | ベータ講師は旧価格を据え置き(グランドファザー)、初月無料はStripeの試用期間で | 既存の運用方針([business.md](../docs/business.md))どおり |

将来の有料機能としては、My Music StaffやOpus1が備えている**振替回数の上限(例: 学期あたり2回まで)や振替の有効期限**が候補になります。国内の「月1回まで振替可」という慣行にも合います([asahi-musicschool](https://asahi-musicschool.com/blog/8185/))。いずれも講師の手間を直接減らす機能なので、プロ専用にしても無料プランの体験を損ないません。逆に、承認フローの回数や3択のうち一部をプロ限定にすると、差別化点そのものを隠してしまうため避けるべきです。

### 公開前に公式ページで確認が必要な数字

次の数字は検索要約しか根拠がなく、価格決定や比較表に使う前の確認が必須です。

| 確認する項目 | 確認先 | 未確定の点 |
|---|---|---|
| STORES予約の料金と、決済手数料5.5%/3.6% | [stores.fun/reserve/pricing](https://stores.fun/reserve/pricing) | 年契約と月払いの価格、最低契約期間の扱い |
| RESERVAの料金と、キャンセル料機能が使えるプラン | [biz.reserva.be/price](https://biz.reserva.be/price/) | 税込かどうか、「P2以上」が消費者向けのどのプランに当たるか |
| Square予約プラス3,000円、後払いの手数料率 | [squareup.com/jp](https://squareup.com/jp/ja/appointments/faq) | 税込かどうか、手数料が3.25%か3.6%か |
| Airリザーブ無料プランでのオンライン決済 | [airregi.jp/reserve/cost](https://airregi.jp/reserve/cost/) | 情報源によって食い違う |
| Jicoo Proの価格 | [jicoo.com/pricing](https://www.jicoo.com/en/pricing) | 800円か1,100円か、税込かどうか |
| Calendlyのプラン構成 | [calendly.com/pricing](https://calendly.com/pricing) | 2026年8月に追加されたとされる「Plus」プラン |
| Stripeの国内料率とConnectの料金 | [stripe.com/jp/pricing](https://stripe.com/jp/pricing)、[stripe.com/connect/pricing](https://stripe.com/connect/pricing) | 3.6%に消費税がかかるか、入金手数料 |
| My Music StaffとFonsの価格 | [mymusicstaff.com/pricing](https://www.mymusicstaff.com/pricing/) | Fonsは19.95ドルと、スタッフ数に応じた段階制の2つの情報がある |

## 結論

価格の水準より先に、**有料化の線をどこに引くか**を考える必要があります。競合は「件数」(STORES予約・RESERVA)か「機能」(Calendly・Airリザーブ・Square予約)のどちらかで線を引いており、件数で引く場合でも50件が下限です。本サービスは件数(10件)と機能(書き込み・カード決済)の両方で絞っていて、しかも件数の上限に当たると生徒に対してエラーが出ます。そのため無料プランが「試す」段階を越えて「使えない」側に寄っています。承認制の3択申請という、他にない機能を持っているのに、それを体験させる前に有料化を迫る設計になっているのが現行案の最大のずれです。

価格そのものには余裕があります。国内で「カードで後から請求できる」機能を持つ最安の選択肢はSquare予約プラスの3,000円で、1回5,000〜8,000円のボイトレなら、キャンセルフィーを1件回収するだけでプロの月額を上回ります。1,480円は、粗利を確保しつつ「Squareの半額」と打ち出せる価格です。Stripe Connect Standardを維持する限り、カード決済機能は原価なしで有料プランの価値を上げられます。今後の検証で最優先にすべきなのは、価格の微調整ではありません。ベータ講師について、**月間予約数と、直前変更・キャンセルの発生率**を実測することです。そうすれば、30件という無料枠と、差別化点の体験頻度を、推論ではなく実データで決められるようになります。

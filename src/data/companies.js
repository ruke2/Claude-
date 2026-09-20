// ============================================================
//  競合デベロッパー（すべて架空の企業）
//  金額単位: 百万円 ／ 年額ベース
//
//  home     … 地盤。その地区では入札にも商品力にも下駄が履ける
//  avgPay   … 平均年収（百万円）。採用市場での比較対象になる
//  avgAge   … 平均年齢　avgTenure … 平均勤続年数
//  いずれも実在企業の数値ではなく、この架空の業界のための設定値である
// ============================================================

export const RIVAL_DEFS = [
  {
    id: 'yotsui', name: '四井不動産', kana: 'YOTSUI ESTATE', short: '四井', color: '#3f6fd8',
    tagline: '業界首位。街づくりの総合力で他を圧倒する巨人。',
    profile: '明治期の財閥系。常盤CBDの再開発から湾岸の大規模複合まで全方位に展開し、売上・利益ともに業界首位を維持する。資金力で競り勝つ入札スタイル。',
    rev: 2380000, op: 348000, np: 231000, assets: 9100000, debt: 4450000, equity: 3050000,
    employees: 25400, brand: 96, aggression: 0.82, cash: 520000,
    focus: { office: 1.0, mixed: 1.0, retail: 0.8, resi: 0.7, hotel: 0.7, logi: 0.5, rental: 0.6, house: 0.2 },
    style: 'balanced', growth: 0.042, listed: true,
    home: 'T', avgPay: 12.8, avgAge: 41.2, avgTenure: 14.6,
  },
  {
    id: 'sanryo', name: '三陵地所', kana: 'SANRYO ESTATE', short: '三陵', color: '#c0392b',
    tagline: '常盤の大地主。オフィス賃貸の収益力は国内随一。',
    profile: '常盤ビジネス地区に膨大な土地を保有する伝統的大家。新規開発より既存ビルの建て替えと賃料改定で稼ぐ。オフィス案件では絶対に譲らない。',
    rev: 1520000, op: 296000, np: 189000, assets: 6800000, debt: 3120000, equity: 2380000,
    employees: 11200, brand: 94, aggression: 0.68, cash: 410000,
    focus: { office: 1.0, mixed: 0.9, retail: 0.7, hotel: 0.6, resi: 0.4, rental: 0.5, logi: 0.3, house: 0.1 },
    style: 'office', growth: 0.031, listed: true,
    home: 'T', avgPay: 13.4, avgAge: 40.4, avgTenure: 15.8,
  },
  {
    id: 'sumikura', name: '住倉不動産', kana: 'SUMIKURA REALTY', short: '住倉', color: '#16a085',
    tagline: '分譲と賃貸の二枚看板。供給戸数で市場を動かす。',
    profile: 'タワーマンション供給で長年トップクラス。自社施工に近い体制でコストを抑え、価格競争力で押し切る。ベイフロントでの供給量は突出。',
    rev: 1010000, op: 232000, np: 148000, assets: 5600000, debt: 3480000, equity: 1580000,
    employees: 6100, brand: 88, aggression: 0.76, cash: 240000,
    focus: { resi: 1.0, rental: 0.95, office: 0.6, retail: 0.5, mixed: 0.7, hotel: 0.4, house: 0.3, logi: 0.2 },
    style: 'resi', growth: 0.038, listed: true,
    home: 'B', avgPay: 7.2, avgAge: 43.1, avgTenure: 12.9,
  },
  {
    id: 'nobayashi', name: '野林不動産', kana: 'NOBAYASHI RE', short: '野林', color: '#8e44ad',
    tagline: '分譲特化の機動部隊。用地の目利きで勝負する。',
    profile: '土地の仕入れから販売までの回転の速さが武器。大手が手を出さない中規模用地を素早く押さえ、商品企画力で高値売却する。',
    rev: 712000, op: 84000, np: 52000, assets: 2100000, debt: 1180000, equity: 620000,
    employees: 3400, brand: 79, aggression: 0.88, cash: 96000,
    focus: { resi: 1.0, house: 0.8, rental: 0.7, office: 0.4, retail: 0.4, logi: 0.5, mixed: 0.4, hotel: 0.3 },
    style: 'aggressive', growth: 0.055, listed: true,
    home: 'S', avgPay: 9.6, avgAge: 38.7, avgTenure: 9.4,
  },
  {
    id: 'morib', name: '杜ビルディング', kana: 'MORI BUILDING CORP', short: '杜ビル', color: '#d4a03c',
    tagline: '超高層の垂直都市。一点豪華主義の再開発集団。',
    profile: '数十年かけて地権者をまとめ、街区ごと作り替える手法で知られる。案件数は少ないが一件あたりの規模と話題性は圧倒的。',
    rev: 318000, op: 71000, np: 38000, assets: 2740000, debt: 1820000, equity: 640000,
    employees: 1650, brand: 91, aggression: 0.58, cash: 78000,
    focus: { mixed: 1.0, office: 0.9, retail: 0.8, hotel: 0.85, resi: 0.5, rental: 0.4, logi: 0.05, house: 0.02 },
    style: 'mega', growth: 0.028, listed: false,
    home: 'I', avgPay: 9.9, avgAge: 42.0, avgTenure: 13.1,
  },
  {
    id: 'toyokyu', name: '東洋急行不動産', kana: 'TOYOKYU RE', short: '東洋急行', color: '#2e86c1',
    tagline: '沿線を持つ強み。郊外の面開発ならこの会社。',
    profile: '私鉄系。自社沿線の駅前再開発と住宅地供給を一体で進める。北野ニュータウンは実質この会社が作った街である。',
    rev: 1080000, op: 96000, np: 58000, assets: 3200000, debt: 1760000, equity: 940000,
    employees: 8900, brand: 82, aggression: 0.62, cash: 132000,
    focus: { house: 1.0, resi: 0.85, retail: 0.8, rental: 0.7, office: 0.5, mixed: 0.6, hotel: 0.5, logi: 0.45 },
    style: 'suburb', growth: 0.034, listed: true,
    home: 'N', avgPay: 10.4, avgAge: 43.6, avgTenure: 16.2,
  },
  {
    id: 'taiga', name: '大河ハウス工業', kana: 'TAIGA HOUSE', short: '大河', color: '#e67e22',
    tagline: '施工力で攻める。物流と戸建の二正面作戦。',
    profile: 'ハウスメーカー発。自社施工体制を活かし、物流施設と戸建分譲を大量供給する。建設費高騰局面でも工期と原価が崩れない。',
    rev: 1640000, op: 148000, np: 94000, assets: 3900000, debt: 1420000, equity: 1680000,
    employees: 19800, brand: 76, aggression: 0.71, cash: 286000,
    focus: { logi: 1.0, house: 1.0, rental: 0.7, resi: 0.6, retail: 0.5, office: 0.3, mixed: 0.3, hotel: 0.25 },
    style: 'builder', growth: 0.045, listed: true,
    home: 'J', avgPay: 8.9, avgAge: 39.8, avgTenure: 12.4,
  },
  {
    id: 'kyobashi', name: '京橋建物', kana: 'KYOBASHI BLDG', short: '京橋', color: '#7f8c8d',
    tagline: '老舗中堅。手堅い賃貸事業とホテルで食う。',
    profile: '明治創業の老舗。派手さはないが神楽坂一帯に優良な小規模ビルを多数保有し、ホテル事業でインバウンド需要を取り込む。',
    rev: 352000, op: 41000, np: 24000, assets: 1520000, debt: 860000, equity: 480000,
    employees: 2300, brand: 71, aggression: 0.48, cash: 42000,
    focus: { office: 0.8, hotel: 1.0, retail: 0.85, rental: 0.7, mixed: 0.5, resi: 0.5, house: 0.2, logi: 0.3 },
    style: 'steady', growth: 0.022, listed: true,
    home: 'K', avgPay: 7.6, avgAge: 44.5, avgTenure: 17.0,
  },
];

/** M&A買収候補となる中小企業のテンプレート */
export const TARGET_TEMPLATES = [
  {
    kind: 'builder', label: '建設会社', icon: '⚒',
    synergy: '建設原価 −%／工期短縮',
    names: ['青木組', '大成興業', '興亜建設', '第一土木', '菱和建設', '川島工務店', '新東亜建設'],
    effect: { costCut: 0.07, speed: 0.12 },
  },
  {
    kind: 'broker', label: '不動産仲介', icon: '◈',
    synergy: '販売力 +／用地情報の獲得',
    names: ['ハウジング湊', '明和住宅販売', 'リアルエステート21', '都市住販', 'アーバンネクスト'],
    effect: { salesPower: 9, landInfo: 0.2 },
  },
  {
    kind: 'pm', label: '不動産管理', icon: '▤',
    synergy: '管理収入／保有物件の稼働率 +',
    names: ['湊コミュニティ', '日本building管理', 'アセットパートナーズ', '常盤ファシリティ'],
    effect: { occupancy: 0.035, feeRate: 0.012 },
  },
  {
    kind: 'reit', label: 'REIT運用会社', icon: '◎',
    synergy: '保有物件を高値で売却できる出口',
    names: ['みなとリート投資顧問', 'グローバル・アセット運用', 'JPリアルティ投信'],
    effect: { exitPremium: 0.09, feeRate: 0.008 },
  },
  {
    kind: 'hotel', label: 'ホテル運営', icon: '▧',
    synergy: 'ホテル事業のNOI +',
    names: ['ホテル叶屋', 'ミナトホテルズ', 'ノーザンイン', 'ロイヤルステイ湊'],
    effect: { hotelNoi: 0.16 },
  },
  {
    kind: 'rival_small', label: '中堅デベロッパー', icon: '▲',
    synergy: '用地・開発中案件をまるごと取得',
    names: ['新星地所', '光和不動産', '明星デベロップメント', '協和都市開発', '八洲不動産'],
    effect: { lots: true, brand: 4 },
  },
];

/** 子会社の設立メニュー */
export const SUB_TYPES = [
  {
    id: 'construction', name: '建設子会社', icon: '⚒', cost: 8500, upkeep: 420,
    staffNeed: 12,
    desc: '自社施工体制を内製化する。建設原価を約6%削減し、工期を1割短縮する。',
    effect: { costCut: 0.06, speed: 0.10 },
    risk: '建設費高騰局面では子会社側が赤字を抱え、連結利益を圧迫することがある。',
  },
  {
    id: 'sales', name: '販売子会社', icon: '¥', cost: 4200, upkeep: 260,
    staffNeed: 18,
    desc: '分譲物件の販売を内製化。契約進捗が約15%速くなり、販売手数料の外部流出を止める。',
    effect: { saleSpeed: 0.15, feeCut: 0.012 },
    risk: '販売が止まると固定費だけが残る。',
  },
  {
    id: 'pm', name: '不動産管理子会社', icon: '▤', cost: 3600, upkeep: 180,
    staffNeed: 14,
    desc: '保有物件の管理を内製化。稼働率が約3%改善し、管理料収入が発生する。',
    effect: { occupancy: 0.03, feeRate: 0.010 },
    risk: '保有物件が少ないうちは赤字。',
  },
  {
    id: 'reit', name: 'REIT運用会社', icon: '◎', cost: 12000, upkeep: 520,
    staffNeed: 10,
    desc: '保有物件の出口を自前で確保する。物件売却額に約8%のプレミアムが乗る。',
    effect: { exitPremium: 0.08, feeRate: 0.006 },
    risk: '金融市場が冷え込むと運用報酬が細る。',
  },
  {
    id: 'overseas', name: '海外事業子会社', icon: '✈', cost: 15000, upkeep: 900,
    staffNeed: 16,
    desc: '海外不動産に投資する。好況期には大きな利益を生むが、為替と現地市況の影響を強く受ける。',
    effect: { overseas: true },
    risk: '損失が出る四半期もある。ハイリスク・ハイリターン。',
  },
];

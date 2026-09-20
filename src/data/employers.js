// ============================================================
//  就職先マスタ — デベロッパー以外も含む、学生から見た人気企業
//    すべて架空の企業である。実在の会社の数値ではない。
//
//  pop  … 素の人気度（0-100）。知名度と憧れ
//  pay  … 平均年収（百万円）
//  hire … 1年あたりの新卒採用数
//  hard … 選考の厳しさの補正（高いほど狭き門）
// ============================================================

/** 業界 */
export const INDUSTRIES = {
  dev:    { id: 'dev',    name: '不動産・デベロッパー', short: '不動産', icon: '🏢' },
  trade:  { id: 'trade',  name: '総合商社',             short: '商社',   icon: '🌏' },
  bank:   { id: 'bank',   name: '銀行・証券',           short: '金融',   icon: '🏦' },
  insure: { id: 'insure', name: '保険',                 short: '保険',   icon: '🛡' },
  consult:{ id: 'consult',name: 'コンサルティング',     short: 'コンサル', icon: '📐' },
  it:     { id: 'it',     name: 'IT・インターネット',   short: 'IT',     icon: '💻' },
  maker:  { id: 'maker',  name: 'メーカー',             short: 'メーカー', icon: '⚙' },
  infra:  { id: 'infra',  name: 'インフラ・鉄道',       short: 'インフラ', icon: '🚄' },
  media:  { id: 'media',  name: 'マスコミ・広告',       short: 'マスコミ', icon: '📺' },
  const_: { id: 'const_', name: '建設・ゼネコン',       short: '建設',   icon: '⚒' },
  gov:    { id: 'gov',    name: '官公庁・公社',         short: '公務',   icon: '⚑' },
};

/**
 * 就職先。デベロッパー8社は data/companies.js の RIVAL_DEFS と
 * rivalId で紐づいていて、毎年の業績で人気が動く。
 */
export const EMPLOYERS = [
  // ---- 総合商社 ----
  { id: 'mitsuba',  name: '三葉商事',       ind: 'trade',   pop: 96, pay: 17.2, hire: 140, hard: 1.35 },
  { id: 'itoyama',  name: '伊藤山商事',     ind: 'trade',   pop: 94, pay: 16.4, hire: 130, hard: 1.32 },
  { id: 'marutomo', name: '丸友商事',       ind: 'trade',   pop: 90, pay: 15.8, hire: 110, hard: 1.30 },
  { id: 'sumiyoshi',name: '住吉商事',       ind: 'trade',   pop: 86, pay: 15.1, hire: 100, hard: 1.26 },
  // ---- コンサル ----
  { id: 'mckinnon', name: 'マッキノン＆カンパニー', ind: 'consult', pop: 88, pay: 19.5, hire: 40, hard: 1.60 },
  { id: 'bostonhill', name: 'ボストンヒル・グループ', ind: 'consult', pop: 84, pay: 18.8, hire: 35, hard: 1.58 },
  { id: 'nomuraken', name: '野邑総合研究所', ind: 'consult', pop: 74, pay: 12.6, hire: 90, hard: 1.18 },
  // ---- 金融 ----
  { id: 'mitsuwabk', name: '三和銀行',      ind: 'bank',    pop: 80, pay: 11.4, hire: 380, hard: 1.05 },
  { id: 'tokiwabk',  name: '常磐フィナンシャル', ind: 'bank', pop: 77, pay: 11.0, hire: 340, hard: 1.03 },
  { id: 'daiwasec',  name: '大輪証券',      ind: 'bank',    pop: 70, pay: 12.8, hire: 260, hard: 1.02 },
  { id: 'meijilife', name: '明成生命',      ind: 'insure',  pop: 72, pay: 10.6, hire: 300, hard: 0.98 },
  { id: 'tokiomar',  name: '東京海陸火災',  ind: 'insure',  pop: 78, pay: 11.8, hire: 250, hard: 1.06 },
  // ---- IT ----
  { id: 'kazamidori', name: '風見どりテック', ind: 'it',    pop: 85, pay: 13.9, hire: 200, hard: 1.22 },
  { id: 'aozoranet',  name: 'アオゾラネット', ind: 'it',    pop: 79, pay: 12.2, hire: 240, hard: 1.10 },
  { id: 'hoshiden',   name: 'ホシデン・システムズ', ind: 'it', pop: 63, pay: 9.4, hire: 420, hard: 0.88 },
  // ---- メーカー ----
  { id: 'toyosu',   name: '豊洲自動車',     ind: 'maker',   pop: 89, pay: 10.2, hire: 520, hard: 1.12 },
  { id: 'sunwave',  name: 'サンウェーブ電機', ind: 'maker', pop: 76, pay: 9.6, hire: 460, hard: 1.00 },
  { id: 'kirinza',  name: '麒麟座ビバレッジ', ind: 'maker', pop: 82, pay: 10.9, hire: 90, hard: 1.24 },
  { id: 'shiseiran',name: '資生蘭',         ind: 'maker',   pop: 81, pay: 9.8, hire: 80, hard: 1.22 },
  // ---- インフラ・鉄道 ----
  { id: 'chuoRail', name: '中央旅客鉄道',   ind: 'infra',   pop: 83, pay: 9.2, hire: 600, hard: 1.04 },
  { id: 'minatoGas',name: '湊都ガス',       ind: 'infra',   pop: 75, pay: 10.4, hire: 130, hard: 1.08 },
  { id: 'kanpower', name: '関都電力',       ind: 'infra',   pop: 71, pay: 9.9, hire: 180, hard: 1.00 },
  { id: 'skyAir',   name: 'スカイ航空',     ind: 'infra',   pop: 80, pay: 8.4, hire: 320, hard: 1.06 },
  // ---- マスコミ・広告 ----
  { id: 'dentaku',  name: '電拓',           ind: 'media',   pop: 87, pay: 14.6, hire: 60, hard: 1.45 },
  { id: 'hakuun',   name: '白雲堂',         ind: 'media',   pop: 79, pay: 12.4, hire: 50, hard: 1.38 },
  { id: 'nihonTV',  name: '日邦テレビ',     ind: 'media',   pop: 84, pay: 15.2, hire: 25, hard: 1.55 },
  // ---- 建設 ----
  { id: 'obashi',   name: '大橋組',         ind: 'const_',  pop: 68, pay: 10.8, hire: 300, hard: 0.94 },
  { id: 'kajiyama', name: '梶山建設',       ind: 'const_',  pop: 66, pay: 10.5, hire: 280, hard: 0.92 },
  // ---- 官公庁 ----
  { id: 'kokudo',   name: '国土交通省',     ind: 'gov',     pop: 73, pay: 7.8, hire: 90, hard: 1.28 },
  { id: 'minatoCity', name: '湊都市役所',   ind: 'gov',     pop: 64, pay: 7.2, hire: 210, hard: 0.96 },
  { id: 'urbanAgency', name: '都市再生機構', ind: 'gov',    pop: 69, pay: 8.6, hire: 70, hard: 1.10 },

  // ---- デベロッパー（競合各社と連動する） ----
  { id: 'yotsui',    name: '四井不動産',     ind: 'dev', rivalId: 'yotsui',    pop: 93, hire: 60, hard: 1.42 },
  { id: 'sanryo',    name: '三陵地所',       ind: 'dev', rivalId: 'sanryo',    pop: 92, hire: 45, hard: 1.44 },
  { id: 'sumikura',  name: '住倉不動産',     ind: 'dev', rivalId: 'sumikura',  pop: 78, hire: 55, hard: 1.16 },
  { id: 'nobayashi', name: '野林不動産',     ind: 'dev', rivalId: 'nobayashi', pop: 70, hire: 40, hard: 1.08 },
  { id: 'morib',     name: '杜ビルディング', ind: 'dev', rivalId: 'morib',     pop: 82, hire: 18, hard: 1.40 },
  { id: 'toyokyu',   name: '東洋急行不動産', ind: 'dev', rivalId: 'toyokyu',   pop: 74, hire: 70, hard: 1.04 },
  { id: 'taiga',     name: '大河ハウス工業', ind: 'dev', rivalId: 'taiga',     pop: 67, hire: 180, hard: 0.90 },
  { id: 'kyobashi',  name: '京橋建物',       ind: 'dev', rivalId: 'kyobashi',  pop: 61, hire: 22, hard: 1.00 },
];

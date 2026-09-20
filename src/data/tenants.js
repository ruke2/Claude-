// ============================================================
//  テナント企業のマスタ
//
//    オフィスのテナントは `data/employers.js` の就職先40社をそのまま使う。
//    就職先ランキングで名前を見た会社が自社のビルに入る、という繋がりを出すためである。
//    商業と物流はオフィスと顔ぶれが違うので、ここに別のマスタを持つ。
//
//    すべて架空の企業である。実在の会社ではない。
//
//    size  … 1店舗（1拠点）あたりの標準的な面積（坪）
//    grade … 求めるグレード（0.0〜1.0）。高いほど良いビルしか見ない
//    pay   … 賃料の支払い力（相場に対する倍率の目安）
//    term  … 標準的な契約年数
// ============================================================

/** 商業テナントの業態 */
export const RETAIL_CATS = {
  apparel: { id: 'apparel', name: 'アパレル', icon: '👔' },
  food:    { id: 'food',    name: '飲食',     icon: '🍽' },
  grocery: { id: 'grocery', name: '食品スーパー', icon: '🛒' },
  elec:    { id: 'elec',    name: '家電・IT', icon: '🔌' },
  culture: { id: 'culture', name: '書籍・文化', icon: '📚' },
  sports:  { id: 'sports',  name: 'スポーツ', icon: '⛹' },
  cinema:  { id: 'cinema',  name: 'シネマ・娯楽', icon: '🎬' },
  fitness: { id: 'fitness', name: 'フィットネス', icon: '🏋' },
  variety: { id: 'variety', name: '雑貨・生活', icon: '🎀' },
  drug:    { id: 'drug',    name: 'ドラッグ・調剤', icon: '💊' },
  furni:   { id: 'furni',   name: '家具・インテリア', icon: '🛋' },
  school:  { id: 'school',  name: '学習塾・スクール', icon: '✏' },
  clinic:  { id: 'clinic',  name: 'クリニックモール', icon: '🩺' },
};

/**
 * 商業テナント。
 * 大型の核テナント（シネマ・スーパー・家具）ほど床は大きいが、賃料の支払い力は低い。
 * 小さな路面店（アパレル・飲食）は坪単価が高い。これは実際の商業施設と同じ関係である。
 */
export const RETAIL_TENANTS = [
  { id: 'r_aurelia',  name: 'アウレリア',           cat: 'apparel', size: 220,  grade: 0.92, pay: 1.28, term: 6 },
  { id: 'r_kobaco',   name: 'コバコ',               cat: 'apparel', size: 380,  grade: 0.62, pay: 1.02, term: 6 },
  { id: 'r_lumine',   name: 'ルミナ・セレクト',     cat: 'apparel', size: 160,  grade: 0.80, pay: 1.20, term: 5 },
  { id: 'r_haretoke', name: 'ハレトケ',             cat: 'apparel', size: 300,  grade: 0.48, pay: 0.94, term: 6 },
  { id: 'r_kuretake', name: '呉竹屋',               cat: 'food',    size: 120,  grade: 0.70, pay: 1.35, term: 5 },
  { id: 'r_bistro',   name: 'ビストロ・ナギ',       cat: 'food',    size: 95,   grade: 0.86, pay: 1.42, term: 5 },
  { id: 'r_men',      name: '麺屋 四季',            cat: 'food',    size: 45,   grade: 0.30, pay: 1.18, term: 4 },
  { id: 'r_cafe',     name: 'カフェ・ソルナ',       cat: 'food',    size: 70,   grade: 0.55, pay: 1.24, term: 5 },
  { id: 'r_teppan',   name: '鉄板 かまど',          cat: 'food',    size: 130,  grade: 0.74, pay: 1.30, term: 6 },
  { id: 'r_marche',   name: 'マルシェ潮',           cat: 'grocery', size: 620,  grade: 0.40, pay: 0.82, term: 15 },
  { id: 'r_seikatsu', name: '生活良品ストア',       cat: 'grocery', size: 900,  grade: 0.34, pay: 0.76, term: 15 },
  { id: 'r_denki',    name: 'ヤマネ電機',           cat: 'elec',    size: 1400, grade: 0.38, pay: 0.72, term: 12 },
  { id: 'r_appl',     name: 'ソラ・ストア',         cat: 'elec',    size: 180,  grade: 0.95, pay: 1.55, term: 8 },
  { id: 'r_books',    name: '文林堂書店',           cat: 'culture', size: 480,  grade: 0.56, pay: 0.86, term: 8 },
  { id: 'r_gallery',  name: 'ギャラリー如月',       cat: 'culture', size: 150,  grade: 0.88, pay: 0.90, term: 5 },
  { id: 'r_sports',   name: 'スポーツ雷鳥',         cat: 'sports',  size: 560,  grade: 0.44, pay: 0.84, term: 10 },
  { id: 'r_cinema',   name: 'シネマ・アストラ',     cat: 'cinema',  size: 2200, grade: 0.66, pay: 0.68, term: 20 },
  { id: 'r_amuse',    name: 'アミューズ湊',         cat: 'cinema',  size: 950,  grade: 0.36, pay: 0.78, term: 10 },
  { id: 'r_gym',      name: 'フィットネス・ゼロ',   cat: 'fitness', size: 700,  grade: 0.50, pay: 0.80, term: 12 },
  { id: 'r_yoga',     name: 'ヨガスタジオ凪',       cat: 'fitness', size: 180,  grade: 0.72, pay: 1.06, term: 6 },
  { id: 'r_zakka',    name: '暮らしの器 いろは',    cat: 'variety', size: 210,  grade: 0.64, pay: 1.04, term: 6 },
  { id: 'r_loft',     name: 'ロフティ',             cat: 'variety', size: 840,  grade: 0.58, pay: 0.92, term: 10 },
  { id: 'r_drug',     name: 'くすりの千歳',         cat: 'drug',    size: 260,  grade: 0.30, pay: 0.96, term: 8 },
  { id: 'r_pharm',    name: '調剤薬局アオイ',       cat: 'drug',    size: 60,   grade: 0.42, pay: 1.10, term: 6 },
  { id: 'r_furni',    name: 'ノルディ・ホーム',     cat: 'furni',   size: 1800, grade: 0.46, pay: 0.66, term: 15 },
  { id: 'r_juku',     name: '進学ゼミ湊都',         cat: 'school',  size: 240,  grade: 0.40, pay: 1.00, term: 8 },
  { id: 'r_eikaiwa',  name: 'アーチ英会話',         cat: 'school',  size: 130,  grade: 0.58, pay: 1.08, term: 6 },
  { id: 'r_clinic',   name: '湊都メディカルモール', cat: 'clinic',  size: 420,  grade: 0.68, pay: 1.14, term: 15 },
  { id: 'r_dental',   name: 'しおみ歯科・矯正',     cat: 'clinic',  size: 90,   grade: 0.60, pay: 1.12, term: 10 },
  { id: 'r_bank',     name: '三和銀行 支店',        cat: 'clinic',  size: 150,  grade: 0.74, pay: 1.16, term: 15 },
];

/** 物流テナントの業態 */
export const LOGI_CATS = {
  ec:     { id: 'ec',     name: 'EC・通販',   icon: '📦' },
  tpl:    { id: 'tpl',    name: '3PL・倉庫',  icon: '🏭' },
  food:   { id: 'food',   name: '食品卸',     icon: '🥬' },
  pharma: { id: 'pharma', name: '医薬品卸',   icon: '💉' },
  parts:  { id: 'parts',  name: '自動車部品', icon: '🔧' },
  cold:   { id: 'cold',   name: '冷凍・冷蔵', icon: '❄' },
};

/**
 * 物流テナント。
 * オフィスや商業と違って1社あたりの床が桁違いに大きく、契約も長い。
 * そのかわり坪単価は低く、グレードもほとんど見ない。
 */
export const LOGI_TENANTS = [
  { id: 'l_sora',    name: 'ソラマート物流',     cat: 'ec',     size: 6500, grade: 0.30, pay: 1.06, term: 10 },
  { id: 'l_quick',   name: 'クイックコマース湊', cat: 'ec',     size: 2200, grade: 0.26, pay: 1.12, term: 7 },
  { id: 'l_yamabiko',name: '山彦運輸',           cat: 'tpl',    size: 5200, grade: 0.20, pay: 0.94, term: 12 },
  { id: 'l_nissho',  name: '日翔ロジスティクス', cat: 'tpl',    size: 8200, grade: 0.24, pay: 0.92, term: 15 },
  { id: 'l_kaiyo',   name: '海洋陸運',           cat: 'tpl',    size: 3400, grade: 0.16, pay: 0.88, term: 10 },
  { id: 'l_midori',  name: 'みどり食品流通',     cat: 'food',   size: 2800, grade: 0.22, pay: 0.96, term: 12 },
  { id: 'l_kura',    name: '蔵前フーズ',         cat: 'food',   size: 1600, grade: 0.18, pay: 0.90, term: 10 },
  { id: 'l_yakuhin', name: '常磐薬品流通',       cat: 'pharma', size: 1900, grade: 0.46, pay: 1.20, term: 15 },
  { id: 'l_toyosu',  name: '豊洲自動車 部品センター', cat: 'parts', size: 4600, grade: 0.28, pay: 0.98, term: 15 },
  { id: 'l_sunwave', name: 'サンウェーブ電機 湊都DC', cat: 'parts', size: 3100, grade: 0.26, pay: 0.96, term: 12 },
  { id: 'l_frozen',  name: 'フローズン・ライン', cat: 'cold',   size: 2400, grade: 0.40, pay: 1.24, term: 15 },
  { id: 'l_kirinza', name: '麒麟座ビバレッジ 配送センター', cat: 'cold', size: 3600, grade: 0.30, pay: 1.02, term: 12 },
];

/**
 * オフィステナントの必要床（坪）。
 * `employers.js` の新卒採用数から従業員規模を見積もり、1人3.3坪で換算する。
 * **1社の全社員を1棟に入れないこと。** 中央旅客鉄道のような大所帯が
 * そのまま出てくると、街のどのビルにも入らない引き合いばかりになる。
 * 本社機能だけが入る前提で 0.55 を掛け、16,000坪で頭打ちにしている。
 */
export function officeDemand(e) {
  const staff = (e.hire || 40) * 24;
  return Math.max(250, Math.min(16000, Math.round(staff * 3.3 * 0.55)));
}

/** オフィステナントとしての格（0〜1）。人気と年収から見る */
export function officeGrade(e) {
  const pay = e.pay || 11;
  return Math.max(0.1, Math.min(1, (e.pop || 70) / 130 + (pay - 9) / 40));
}

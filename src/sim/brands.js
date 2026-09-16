// ============================================================
//  自社ブランド — 用途カテゴリごとのブランドを育てる
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { uid } from '../core/state.js';
import { USES } from '../data/city.js';

/** ブランドを立てられるカテゴリ */
export const BRAND_CATEGORIES = {
  resi:   { id: 'resi',   name: '分譲マンション', uses: ['resi'],           icon: '▤', example: 'パークコート、ブランズ、プラウド' },
  house:  { id: 'house',  name: '戸建分譲',       uses: ['house'],          icon: '⌂', example: 'ファインコート、プレミアムステージ' },
  rental: { id: 'rental', name: '賃貸レジデンス', uses: ['rental'],         icon: '▥', example: 'パークアクシス、プラウドフラット' },
  office: { id: 'office', name: 'オフィスビル',   uses: ['office', 'mixed'], icon: '▮', example: '○○ビルディング、○○ゲートタワー' },
  retail: { id: 'retail', name: '商業施設',       uses: ['retail', 'mixed'], icon: '▦', example: 'ららぽーと、ラゾーナ、アーバンドック' },
  hotel:  { id: 'hotel',  name: 'ホテル',         uses: ['hotel'],          icon: '▧', example: 'ザ・セレスティン、ガーデンホテル' },
  logi:   { id: 'logi',   name: '物流施設',       uses: ['logi'],           icon: '▬', example: 'MFLP、GLP、プロロジスパーク' },
};

/** ブランドの格 */
export const BRAND_GRADES = {
  mass:    { id: 'mass',    name: 'ボリューム', cost: 240,  priceMul: 1.00, growth: 1.30, cap: 78,  desc: '価格訴求型。認知は広がりやすいが単価は上がりにくい。' },
  upper:   { id: 'upper',   name: 'アッパー',   cost: 620,  priceMul: 1.05, growth: 1.00, cap: 90,  desc: '主力ブランド。バランスがよく、育てば大きな武器になる。' },
  premium: { id: 'premium', name: 'プレミアム', cost: 1450, priceMul: 1.12, growth: 0.70, cap: 100, desc: '最上位。育成に時間はかかるが、単価と賃料を大きく押し上げる。' },
};

/** ブランドを創設する */
export function createBrand(g, { name, category, grade }) {
  const G = BRAND_GRADES[grade];
  const b = {
    id: uid('B'), name: name.slice(0, 16), category, grade,
    awareness: 6 + (grade === 'premium' ? 4 : 0),
    reputation: 55,
    supplied: 0, area: 0, units: 0,
    foundedWeek: g.week, lastUsedWeek: g.week,
    adSpend: 0,
  };
  g.cash -= G.cost;
  g.finance.quarterAcc.sga += G.cost;
  g.brands.push(b);
  return b;
}

/** 用途に使えるブランドを返す */
export function brandsFor(g, useId) {
  return g.brands.filter(b => (BRAND_CATEGORIES[b.category]?.uses || []).includes(useId));
}

export function getBrand(g, id) { return id ? g.brands.find(b => b.id === id) : null; }

/** ブランドによる補正 */
export function brandEffect(g, brandId) {
  const b = getBrand(g, brandId);
  if (!b) return { price: 1, speed: 1, rent: 1, awareness: 0 };
  const G = BRAND_GRADES[b.grade];
  const a = b.awareness / 100;
  const rep = 0.85 + b.reputation / 340;
  return {
    price: (1 + a * 0.14) * G.priceMul * rep,
    speed: (1 + a * 0.30) * rep,
    rent: (1 + a * 0.10) * G.priceMul * rep,
    awareness: b.awareness,
    brand: b,
  };
}

/** 供給による認知度の成長 */
export function growBrand(g, brandId, opt = {}) {
  const b = getBrand(g, brandId);
  if (!b) return;
  const G = BRAND_GRADES[b.grade];
  const scale = clamp((opt.area || 0) / 6000, 0.25, 2.4);
  const gain = (opt.base ?? 3.5) * scale * G.growth * (1 - b.awareness / (G.cap + 12));
  b.awareness = clamp(b.awareness + gain, 0, G.cap);
  b.lastUsedWeek = g.week;
  if (opt.supplied) { b.supplied++; b.area += opt.area || 0; b.units += opt.units || 0; }
  if (opt.reputation) b.reputation = clamp(b.reputation + opt.reputation, 0, 100);
}

/** 評判を落とす（値下げ・長期在庫・減損） */
export function damageBrand(g, brandId, amount, repHit = 0) {
  const b = getBrand(g, brandId);
  if (!b) return;
  b.awareness = clamp(b.awareness - amount, 0, 100);
  b.reputation = clamp(b.reputation - repHit, 0, 100);
}

/** 毎週の減衰と広告 */
export function stepBrands(g, rng, news) {
  for (const b of g.brands) {
    const G = BRAND_GRADES[b.grade];
    // 供給が途切れると忘れられる
    const idle = g.week - b.lastUsedWeek;
    if (idle > 52) b.awareness = clamp(b.awareness - 0.05, 0, 100);
    // 広告投資
    if (b.adSpend > 0) {
      const w = b.adSpend / 52;
      g.cash -= w;
      g.finance.quarterAcc.sga += w;
      b.awareness = clamp(b.awareness + (b.adSpend / 900) * G.growth * (1 - b.awareness / (G.cap + 8)) / 52 * 12, 0, G.cap);
    }
    b.reputation = clamp(b.reputation + (55 - b.reputation) * 0.002, 0, 100);
  }
}

/** ブランドの総合力（会社ブランドへの寄与） */
export function brandPortfolioScore(g) {
  if (!g.brands.length) return 0;
  return g.brands.reduce((a, b) => a + b.awareness * (BRAND_GRADES[b.grade].priceMul), 0) / Math.max(3, g.brands.length);
}

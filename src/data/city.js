// ============================================================
//  湊都（みなと）市 — 都市データ
//  金額単位: 百万円 / 面積単位: 坪
// ============================================================
import { hash2 } from '../core/rng.js';

/** 地区定義 */
export const DISTRICTS = {
  T: {
    id: 'T', name: '常盤ビジネス地区', short: '常盤', kana: 'TOKIWA CBD',
    desc: '大手町・丸の内に比肩する国内屈指のビジネス街。超高層オフィスが林立し、一区画の取得が数百億円規模になる。',
    landPrice: 20.0,          // 百万円/坪（更地の相場）
    farRange: [700, 1300],    // 容積率(%)
    rentOffice: 41000,        // 円/坪/月
    rentRetail: 34000,
    rentResi: 22700,
    rentHotel: 52000,
    priceResi: 5.8,           // 分譲 百万円/専有坪
    capRate: 0.036,           // 還元利回り
    station: 0.98,            // 駅力 0-1
    fit: { office: 1.00, retail: 0.86, resi: 0.62, rental: 0.58, hotel: 0.84, logi: 0.10, house: 0.05, mixed: 0.96 },
    hue: 208, elev: 2,
  },
  B: {
    id: 'B', name: '汐見ベイフロント', short: '汐見', kana: 'SHIOMI BAY',
    desc: '再開発が進む湾岸エリア。タワーマンションと大型商業の主戦場で、供給過多リスクと隣り合わせ。',
    landPrice: 6.2, farRange: [400, 900],
    rentOffice: 24000, rentRetail: 26000, rentResi: 17800, rentHotel: 40000,
    priceResi: 4.3, capRate: 0.042, station: 0.76,
    fit: { office: 0.70, retail: 0.88, resi: 1.00, rental: 0.92, hotel: 0.80, logi: 0.28, house: 0.20, mixed: 0.92 },
    hue: 194, elev: 0,
  },
  A: {
    id: 'A', name: '青葉台レジデンス', short: '青葉台', kana: 'AOBADAI',
    desc: '高台の邸宅街。厳しい高さ制限と住民協定があり、低層・高単価の商品開発が求められる。',
    landPrice: 3.6, farRange: [150, 300],
    rentOffice: 13000, rentRetail: 15000, rentResi: 16200, rentHotel: 22000,
    priceResi: 4.0, capRate: 0.044, station: 0.58,
    fit: { office: 0.22, retail: 0.34, resi: 0.92, rental: 0.74, hotel: 0.30, logi: 0.05, house: 1.00, mixed: 0.40 },
    hue: 138, elev: 3,
  },
  K: {
    id: 'K', name: '神楽坂旧市街', short: '神楽坂', kana: 'KAGURAZAKA',
    desc: '路地と老舗が残る商業地。地権者が多く用地はまとまりにくいが、ホテル・商業の収益性は高い。',
    landPrice: 6.4, farRange: [300, 700],
    rentOffice: 22000, rentRetail: 31000, rentResi: 18400, rentHotel: 48000,
    priceResi: 4.5, capRate: 0.041, station: 0.84,
    fit: { office: 0.62, retail: 1.00, resi: 0.70, rental: 0.76, hotel: 0.98, logi: 0.08, house: 0.24, mixed: 0.80 },
    hue: 28, elev: 1,
  },
  N: {
    id: 'N', name: '北野ニュータウン', short: '北野', kana: 'KITANO NT',
    desc: '郊外のファミリー層向け住宅地。用地は安いが単価も低く、量で稼ぐ薄利のエリア。',
    landPrice: 1.25, farRange: [150, 400],
    rentOffice: 11000, rentRetail: 13000, rentResi: 11300, rentHotel: 17000,
    priceResi: 2.3, capRate: 0.052, station: 0.42,
    fit: { office: 0.20, retail: 0.52, resi: 0.86, rental: 0.82, hotel: 0.22, logi: 0.36, house: 0.94, mixed: 0.44 },
    hue: 96, elev: 1,
  },
  J: {
    id: 'J', name: '城東ロジスティクス', short: '城東', kana: 'JOTO LOGI',
    desc: '工場跡地が広がる湾岸北部。大規模物流施設の適地で、EC需要を背景に賃料が上昇中。',
    landPrice: 0.62, farRange: [200, 400],
    rentOffice: 9500, rentRetail: 10000, rentResi: 9200, rentHotel: 13000, rentLogi: 5200,
    priceResi: 1.9, capRate: 0.042, station: 0.30,
    fit: { office: 0.16, retail: 0.30, resi: 0.40, rental: 0.38, hotel: 0.12, logi: 1.00, house: 0.44, mixed: 0.30 },
    hue: 44, elev: 0,
  },
};

/**
 * 都市レイアウト（16×16）
 *  T/B/A/K/N/J=地区区画  .=道路  =:幹線  ~=水域  #=公園  ^=緑地/丘
 */
export const MAP_W = 16, MAP_H = 16;
export const MAP_ROWS = [
  'NN.NNN#N.NNN.JJJ',
  'NN.NNNNN.NNN.JJJ',
  '=====.=====.====',
  'AA.AANNN.JJJ.JJJ',
  'AA.AA^..J.JJJ.JJ',
  'A#.AA.KK.....JJJ',
  '=====.==.=======',
  'KK.KK.KK.TT.TTJJ',
  'KK.KK.TT.TT.TT..',
  '..#.....TT.TT.BB',
  '=====.=====.====',
  'KK.BB.BB.TT.BBBB',
  'BB.BB.BB.BB.BBBB',
  'BB.BB#BB.BB.BBBB',
  '=====.=====.====',
  '~~~~~~~~~~~~~~~~',
];

export const TERRAIN = { ROAD: 'road', AVENUE: 'avenue', WATER: 'water', PARK: 'park', GREEN: 'green', LOT: 'lot' };

export function terrainOf(ch) {
  if (ch === '.') return TERRAIN.ROAD;
  if (ch === '=') return TERRAIN.AVENUE;
  if (ch === '~') return TERRAIN.WATER;
  if (ch === '#') return TERRAIN.PARK;
  if (ch === '^') return TERRAIN.GREEN;
  return TERRAIN.LOT;
}

/** 区画の標高（丘陵の演出用） */
export function elevationAt(x, y, districtId) {
  const base = districtId && DISTRICTS[districtId] ? DISTRICTS[districtId].elev : 0;
  return base * 0.5 + hash2(x, y, 77) * 0.6;
}

/** 建物用途マスタ */
export const USES = {
  office: {
    id: 'office', name: 'オフィスビル', short: 'OFC', icon: '▮',
    build: 1.85,            // 建築費 百万円/延床坪
    quarters: 7,            // 標準工期（四半期）
    efficiency: 0.60,       // 延床に対する貸室/専有比率
    model: 'lease',
    color: '#6fa6e8',
    desc: '長期の賃料収入と含み益を生む主力アセット。稼働率は景況に敏感。',
  },
  resi: {
    id: 'resi', name: '分譲マンション', short: 'RES', icon: '▤',
    build: 1.05, quarters: 6, efficiency: 0.74, model: 'sale',
    color: '#8fd4b0', desc: '竣工前から売れる回転型商品。売れ残ると在庫評価損が出る。',
  },
  rental: {
    id: 'rental', name: '賃貸レジデンス', short: 'RNT', icon: '▥',
    build: 0.92, quarters: 5, efficiency: 0.78, model: 'lease',
    color: '#9fd0e8', desc: '景気変動に強い安定収益。利回りは低めだが空室リスクが小さい。',
  },
  retail: {
    id: 'retail', name: '商業施設', short: 'RTL', icon: '▦',
    build: 1.15, quarters: 6, efficiency: 0.66, model: 'lease',
    color: '#f0b269', desc: '歩行者需要に強く依存。好立地では極めて高いNOIを生む。',
  },
  hotel: {
    id: 'hotel', name: 'ホテル', short: 'HTL', icon: '▧',
    build: 1.35, quarters: 8, efficiency: 0.58, model: 'lease',
    color: '#e79ac0', desc: 'インバウンド循環の影響が最も大きい。好況期の収益は突出する。',
  },
  logi: {
    id: 'logi', name: '物流施設', short: 'LOG', icon: '▬',
    build: 0.48, quarters: 4, efficiency: 0.88, model: 'lease',
    color: '#b9c2cf', desc: '工期が短く投資効率が高い。長期固定賃貸で不況耐性も高い。',
  },
  house: {
    id: 'house', name: '戸建分譲', short: 'HSE', icon: '⌂',
    build: 0.82, quarters: 4, efficiency: 0.80, model: 'sale',
    color: '#c9d98f', desc: '小さく速く回せる。郊外では堅い需要があるが単価は伸びない。',
  },
  mixed: {
    id: 'mixed', name: '複合再開発', short: 'MIX', icon: '◧',
    build: 1.55, quarters: 10, efficiency: 0.68, model: 'both',
    color: '#c4a6f0', desc: 'オフィス・商業・住宅を一体開発する大型案件。工期は長いが街の価値ごと押し上げる。',
  },
};

/** 商品グレード */
export const GRADES = {
  standard: { id: 'standard', name: 'スタンダード', costMul: 1.00, priceMul: 1.00, brandGain: 0.4, demandMul: 1.00, desc: '標準仕様。無難だがブランドは積み上がらない。' },
  high:     { id: 'high',     name: 'ハイグレード', costMul: 1.22, priceMul: 1.18, brandGain: 1.2, demandMul: 0.94, desc: '設備・共用部を強化。上位層を狙う。' },
  luxury:   { id: 'luxury',   name: 'ラグジュアリー', costMul: 1.55, priceMul: 1.48, brandGain: 2.6, demandMul: 0.80, desc: '最高級仕様。当たれば単価も企業ブランドも跳ねる。' },
};

/** 建物の外観バリエーション */
export const FACADES = ['curtain', 'grid', 'stone', 'brick', 'panel', 'terrace'];

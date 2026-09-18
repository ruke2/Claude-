// ============================================================
//  湊都（みなと）市 — 都市データ
//  金額単位: 百万円 / 面積単位: 坪
// ============================================================
import { hash2 } from '../core/rng.js';

/** 地区定義 */
export const DISTRICTS = {
  T: {
    id: 'T', lotSize: 1900, name: '常盤ビジネス地区', short: '常盤', kana: 'TOKIWA CBD',
    desc: '大手町・丸の内に比肩する国内屈指のビジネス街。超高層オフィスが林立し、一区画の取得が数百億円規模になる。',
    landPrice: 20.0,          // 百万円/坪（更地の相場）
    farRange: [700, 1300],    // 容積率(%)
    rentOffice: 41000,        // 円/坪/月
    rentRetail: 34000,
    rentResi: 22700,
    rentHotel: 52000,
    rentLogi: 7800,
    priceResi: 5.8,           // 分譲 百万円/専有坪
    capRate: 0.036,           // 還元利回り
    station: 0.98,            // 駅力 0-1
    fit: { office: 1.00, retail: 0.86, resi: 0.62, rental: 0.58, hotel: 0.84, logi: 0.10, house: 0.05, mixed: 0.96 },
    height: [14, 54],      // 既存の建物の階数レンジ
    usePool: ['office', 'office', 'office', 'mixed', 'retail', 'hotel', 'rental'],
    hue: 208, elev: 2,
  },
  B: {
    id: 'B', lotSize: 1650, name: '汐見ベイフロント', short: '汐見', kana: 'SHIOMI BAY',
    desc: '再開発が進む湾岸エリア。タワーマンションと大型商業の主戦場で、供給過多リスクと隣り合わせ。',
    landPrice: 7.3, farRange: [400, 900],
    rentOffice: 24000, rentRetail: 26000, rentResi: 17800, rentHotel: 40000,
    rentLogi: 6200,
    priceResi: 4.3, capRate: 0.042, station: 0.76,
    fit: { office: 0.70, retail: 0.88, resi: 1.00, rental: 0.92, hotel: 0.80, logi: 0.28, house: 0.20, mixed: 0.92 },
    height: [6, 44],      // 既存の建物の階数レンジ
    usePool: ['resi', 'rental', 'resi', 'retail', 'office', 'hotel', 'mixed'],
    hue: 194, elev: 0,
  },
  A: {
    id: 'A', lotSize: 420, name: '青葉台レジデンス', short: '青葉台', kana: 'AOBADAI',
    desc: '高台の邸宅街。厳しい高さ制限と住民協定があり、低層・高単価の商品開発が求められる。',
    landPrice: 3.1, farRange: [150, 300],
    rentOffice: 13000, rentRetail: 15000, rentResi: 16200, rentHotel: 22000,
    rentLogi: 4200,
    priceResi: 4.0, capRate: 0.044, station: 0.58,
    fit: { office: 0.22, retail: 0.34, resi: 0.92, rental: 0.74, hotel: 0.30, logi: 0.05, house: 1.00, mixed: 0.40 },
    height: [2, 5],      // 既存の建物の階数レンジ
    usePool: ['house', 'house', 'resi', 'rental'],
    hue: 138, elev: 3,
  },
  K: {
    id: 'K', lotSize: 380, name: '神楽坂旧市街', short: '神楽坂', kana: 'KAGURAZAKA',
    desc: '路地と老舗が残る商業地。地権者が多く用地はまとまりにくいが、ホテル・商業の収益性は高い。',
    landPrice: 6.4, farRange: [300, 700],
    rentOffice: 22000, rentRetail: 33000, rentResi: 18400, rentHotel: 38000,
    rentLogi: 5200,
    priceResi: 4.5, capRate: 0.041, station: 0.84,
    fit: { office: 0.62, retail: 1.00, resi: 0.70, rental: 0.76, hotel: 0.98, logi: 0.08, house: 0.24, mixed: 0.80 },
    height: [3, 13],      // 既存の建物の階数レンジ
    usePool: ['retail', 'hotel', 'office', 'rental', 'retail'],
    hue: 28, elev: 1,
  },
  N: {
    id: 'N', lotSize: 640, name: '北野ニュータウン', short: '北野', kana: 'KITANO NT',
    desc: '郊外のファミリー層向け住宅地。用地は安いが単価も低く、量で稼ぐ薄利のエリア。',
    landPrice: 1.25, farRange: [150, 400],
    rentOffice: 11000, rentRetail: 13000, rentResi: 11300, rentHotel: 17000,
    rentLogi: 4600,
    priceResi: 2.3, capRate: 0.052, station: 0.42,
    fit: { office: 0.20, retail: 0.52, resi: 0.86, rental: 0.82, hotel: 0.22, logi: 0.36, house: 0.94, mixed: 0.44 },
    height: [3, 15],      // 既存の建物の階数レンジ
    usePool: ['house', 'resi', 'rental', 'retail', 'house'],
    hue: 96, elev: 1,
  },
  I: {
    id: 'I', lotSize: 1500, name: '港南インターナショナル', short: '港南', kana: 'KONAN INTL',
    desc: '外資系企業のアジア拠点と大使館が集まる国際地区。高級ホテルの需要が突出して高く、地価も常盤に次ぐ。',
    landPrice: 12.3, farRange: [500, 1000],
    rentOffice: 34000, rentRetail: 28000, rentResi: 19500, rentHotel: 42000,
    rentLogi: 6800,
    priceResi: 5.0, capRate: 0.038, station: 0.88,
    fit: { office: 0.92, retail: 0.78, resi: 0.74, rental: 0.70, hotel: 1.00, logi: 0.12, house: 0.10, mixed: 0.90 },
    height: [8, 40],      // 既存の建物の階数レンジ
    usePool: ['office', 'hotel', 'office', 'mixed', 'retail', 'rental'],
    hue: 252, elev: 1,
  },
  S: {
    id: 'S', lotSize: 900, name: '桜川イノベーション', short: '桜川', kana: 'SAKURAGAWA',
    desc: '大学と研究機関を核に再編が進む新興地区。研究開発型オフィスと若年層向け賃貸の需要が伸び続けている。',
    landPrice: 3.2, farRange: [300, 600],
    rentOffice: 24000, rentRetail: 19500, rentResi: 15200, rentHotel: 18000,
    rentLogi: 5000,
    priceResi: 3.5, capRate: 0.042, station: 0.66,
    fit: { office: 0.88, retail: 0.62, resi: 0.78, rental: 0.90, hotel: 0.42, logi: 0.30, house: 0.62, mixed: 0.70 },
    height: [3, 18],      // 既存の建物の階数レンジ
    usePool: ['office', 'rental', 'retail', 'resi', 'office'],
    hue: 168, elev: 1,
  },
  J: {
    id: 'J', lotSize: 2600, name: '城東ロジスティクス', short: '城東', kana: 'JOTO LOGI',
    desc: '工場跡地が広がる湾岸北部。大規模物流施設の適地で、EC需要を背景に賃料が上昇中。',
    landPrice: 0.62, farRange: [200, 400],
    rentOffice: 9500, rentRetail: 10000, rentResi: 9200, rentHotel: 13000, rentLogi: 5200,
    priceResi: 1.9, capRate: 0.042, station: 0.30,
    fit: { office: 0.16, retail: 0.30, resi: 0.40, rental: 0.38, hotel: 0.12, logi: 1.00, house: 0.44, mixed: 0.30 },
    height: [1, 5],      // 既存の建物の階数レンジ
    usePool: ['logi', 'logi', 'logi', 'house', 'retail'],
    hue: 44, elev: 0,
  },

  // ---- ここから拡張された地区 ----
  F: {
    id: 'F', lotSize: 360, name: '藤ヶ丘ガーデンヒル', short: '藤ヶ丘', kana: 'FUJIGAOKA',
    desc: '市内でもっとも地価の高い低層住宅街。厳しい高さ制限と景観協定があり、戸建と低層の高級分譲しか成り立たないが、単価は市内随一である。',
    landPrice: 5.9,
    farRange: [100, 200],
    rentOffice: 12000,
    rentRetail: 16500,
    rentResi: 24500,
    rentHotel: 27000,
    rentLogi: 4000,
    priceResi: 7.4,
    capRate: 0.037,
    station: 0.50,
    fit: { office: 0.16, retail: 0.30, resi: 0.74, rental: 0.58, hotel: 0.26, logi: 0.04, house: 1.00, mixed: 0.30 },
    height: [2, 5],      // 既存の建物の階数レンジ
    usePool: ['house', 'house', 'house', 'resi', 'rental'],
    hue: 334, elev: 4,
  },
  M: {
    id: 'M', lotSize: 1200, name: '南雲メディカル・リサーチパーク', short: '南雲', kana: 'NAGUMO MRP',
    desc: '大学病院と製薬・医療機器の研究拠点が集まる特区。研究開発型オフィスと、研究者向けの賃貸レジデンス、患者家族の長期滞在ホテルに需要がある。',
    landPrice: 4.9,
    farRange: [400, 800],
    rentOffice: 29500,
    rentRetail: 18000,
    rentResi: 13800,
    rentHotel: 31000,
    rentLogi: 5400,
    priceResi: 3.9,
    capRate: 0.040,
    station: 0.72,
    fit: { office: 0.94, retail: 0.50, resi: 0.66, rental: 0.90, hotel: 0.70, logi: 0.18, house: 0.30, mixed: 0.78 },
    height: [4, 22],      // 既存の建物の階数レンジ
    usePool: ['office', 'office', 'rental', 'hotel', 'retail', 'resi'],
    hue: 176, elev: 1,
  },
  E: {
    id: 'E', lotSize: 2200, name: '湊都エアポートシティ', short: '空港', kana: 'AIRPORT CITY',
    desc: '湊都空港に隣接する埋立地。連絡橋で本土とつながる。航空法の高さ制限があって高層は建てられないが、区画は市内最大で、航空貨物の物流施設と乗継客向けのホテルが主役になる。',
    landPrice: 0.85,
    farRange: [200, 400],
    rentOffice: 18000,
    rentRetail: 13000,
    rentResi: 9500,
    rentHotel: 23500,
    rentLogi: 5600,
    priceResi: 2.2,
    capRate: 0.044,
    station: 0.62,
    fit: { office: 0.60, retail: 0.48, resi: 0.28, rental: 0.34, hotel: 0.96, logi: 0.94, house: 0.10, mixed: 0.62 },
    height: [2, 16],      // 既存の建物の階数レンジ
    usePool: ['hotel', 'logi', 'logi', 'office', 'retail', 'mixed'],
    hue: 268, elev: 0,
  },
  W: {
    id: 'W', lotSize: 300, name: '若葉町（対岸の旧市街）', short: '若葉町', kana: 'WAKABACHO',
    desc: '湊川の対岸に残る古い商店街と長屋の街。区画は小さく地価も安い。小ぶりな賃貸レジデンスと近隣型商業を数で積み上げる、駆け出しのデベロッパー向けの土地である。',
    landPrice: 1.05,
    farRange: [200, 500],
    rentOffice: 14000,
    rentRetail: 20000,
    rentResi: 13200,
    rentHotel: 20000,
    rentLogi: 4400,
    priceResi: 2.75,
    capRate: 0.050,
    station: 0.56,
    fit: { office: 0.34, retail: 0.76, resi: 0.78, rental: 0.88, hotel: 0.36, logi: 0.40, house: 0.34, mixed: 0.62 },
    height: [2, 10],      // 既存の建物の階数レンジ
    usePool: ['retail', 'rental', 'rental', 'resi', 'house', 'office'],
    hue: 62, elev: 0,
  },
};


/**
 * 都市レイアウト（32×32）
 *  T/B/A/K/N/J/I/S/F/M/E/W=地区区画  .=道路  =:幹線  ~=水域  #=公園  ^=緑地/丘
 *
 *  ◆ 左上の 24×24（0〜23行の先頭24文字）は変更しないこと ◆
 *    ここを動かすと、古いセーブの区画と対応が取れなくなる。
 *    地図を広げるときは、右側と下側に足していく。
 */
export const MAP_W = 32, MAP_H = 32;
export const MAP_ROWS = [
  'AAA.AAA.NNN.N#N.SSS.SSS.' + 'FFF.FFF.',
  'A#A.AAA.NNN.NNN.SSS.SSS.' + 'FFF.F#F.',
  'AAA.AAA.NNN.NNN.SSS.S^S.' + 'FF^.FFF.',
  '========================' + '========',
  'AAA.AAA.N^N.NNN.SSS.SSS.' + 'FFF.FFF.',
  'AAA.A^A.NNN.NNN.SSS.SSS.' + 'F#F.FFF.',
  'AAA.AAA.NNN.NNN.S#S.SSS.' + 'FFF.FF^.',
  '........................' + '........',
  'KKK.KKK.TTT.TTT.JJJ.JJJ.' + 'MMM.MMM.',
  'KKK.KKK.T#T.TTT.JJJ.JJJ.' + 'MMM.M#M.',
  'KK#.KKK.TTT.TTT.JJJ.JJJ.' + 'MMM.MMM.',
  '========================' + '========',
  'KKK.KKK.TTT.TTT.JJJ.J#J.' + 'MMM.MMM.',
  'KKK.KKK.TTT.TT#.JJJ.JJJ.' + 'M#M.MMM.',
  'KKK.KK^.TTT.TTT.JJJ.JJJ.' + 'MMM.MMM.',
  '........................' + '........',
  'III.III.BBB.BBB.BBB.JJJ.' + 'EEE.EEE.',
  'I#I.III.BBB.BBB.BBB.JJJ.' + 'EEE.EEE.',
  'III.III.BBB.BBB.BB#.JJJ~' + 'EEE.E#E.',
  '===========~~~~=======~~' + '========',
  '~II.BBB.BBB~~~~.BBB.~~~~' + 'EEE.EEE.',
  '~~I.BBB.BB#~~~~.BB~~~~~~' + 'EEE.EE^.',
  '~~~~~~~~~~~~~~~~~~~~~~~~' + '~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~' + '~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~' + '========',
  'WWW.WWW.WWW.WWW.~~~~~~~~' + 'EEE.EEE.',
  'W#W.WWW.WWW.WWW.~~~~~~~~' + 'EEE.E#E.',
  'WWW.WWW.WW^.WWW.~~~~~~~~' + 'EEE.EEE.',
  '================~~~~~~~~' + '========',
  'WWW.WWW.WWW.WWW.~~~~~~~~' + 'EEE.EEE.',
  'WWW.W#W.WWW.W^W.~~~~~~~~' + 'E^E.EEE.',
  'WWW.WWW.WWW.WWW.~~~~~~~~' + 'EEE.EEE.',
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
    weeks: 104,             // 標準工期（週）
    efficiency: 0.60,       // 延床に対する貸室/専有比率
    model: 'lease',
    color: '#6fa6e8',
    desc: '長期の賃料収入と含み益を生む主力アセット。稼働率は景況に敏感。',
  },
  resi: {
    id: 'resi', name: '分譲マンション', short: 'RES', icon: '▤',
    build: 1.05, weeks: 91, efficiency: 0.74, model: 'sale',
    color: '#8fd4b0', desc: '竣工前から売れる回転型商品。売れ残ると在庫評価損が出る。',
  },
  rental: {
    id: 'rental', name: '賃貸レジデンス', short: 'RNT', icon: '▥',
    build: 0.92, weeks: 78, efficiency: 0.78, model: 'lease',
    color: '#9fd0e8', desc: '景気変動に強い安定収益。利回りは低めだが空室リスクが小さい。',
  },
  retail: {
    id: 'retail', name: '商業施設', short: 'RTL', icon: '▦',
    build: 1.15, weeks: 78, efficiency: 0.66, model: 'lease',
    color: '#f0b269', desc: '歩行者需要に強く依存。好立地では極めて高いNOIを生む。',
  },
  hotel: {
    id: 'hotel', name: 'ホテル', short: 'HTL', icon: '▧',
    build: 1.35, weeks: 104, efficiency: 0.58, model: 'lease',
    color: '#e79ac0', desc: 'インバウンド循環の影響が最も大きい。好況期の収益は突出する。',
  },
  logi: {
    id: 'logi', name: '物流施設', short: 'LOG', icon: '▬',
    build: 0.48, weeks: 52, efficiency: 0.88, model: 'lease',
    color: '#b9c2cf', desc: '工期が短く投資効率が高い。長期固定賃貸で不況耐性も高い。',
  },
  house: {
    id: 'house', name: '戸建分譲', short: 'HSE', icon: '⌂',
    build: 0.82, weeks: 39, efficiency: 0.80, model: 'sale',
    color: '#c9d98f', desc: '小さく速く回せる。郊外では堅い需要があるが単価は伸びない。',
  },
  mixed: {
    id: 'mixed', name: '複合再開発', short: 'MIX', icon: '◧',
    build: 1.55, weeks: 143, efficiency: 0.68, model: 'both',
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

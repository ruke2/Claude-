// ============================================================
//  時間帯・天候パレット
//  四半期＝季節に応じて街の時間帯が変わる
//    Q1春=朝 / Q2夏=真昼 / Q3秋=夕景 / Q4冬=夜景
// ============================================================

export const TIMES = {
  morning: {
    key: 'morning', label: '早朝',
    sky: ['#12295a', '#3a629e', '#86a6cc', '#d9c0a2', '#f6dcb4'],
    horizon: '#f5d9b0',
    sun: { x: 0.74, alt: 0.10, r: 44, color: 'rgba(255,232,190,0.92)' },
    ambient: '#4a5f82', ambientAmt: 0.30,
    faceTop: 1.02, faceL: 0.92, faceR: 0.76,
    groundTint: 'rgba(120,150,200,0.10)',
    shadow: 0.20, shadowDir: [1.1, 0.5],
    windowLit: 0.10, glow: 0.2,
    fog: 'rgba(150,175,210,0.16)',
    street: 0.0,
    glass: [208, 26, 64],
  },
  noon: {
    key: 'noon', label: '正午',
    sky: ['#2a62ad', '#4f8bd2', '#86b7e4', '#b6d5ee', '#dcecf7'],
    horizon: '#e3eef7',
    sun: { x: 0.52, alt: 0.62, r: 32, color: 'rgba(255,255,244,0.6)' },
    ambient: '#bcd2e8', ambientAmt: 0.16,
    faceTop: 1.08, faceL: 1.00, faceR: 0.87,
    groundTint: 'rgba(255,250,235,0.06)',
    shadow: 0.22, shadowDir: [0.65, 0.35],
    windowLit: 0.018, glow: 0.05,
    fog: 'rgba(200,225,245,0.10)',
    street: 0.0,
    glass: [205, 30, 73],
  },
  evening: {
    key: 'evening', label: '夕景',
    sky: ['#1a1230', '#4a2450', '#963d56', '#e0714a', '#ffb867'],
    horizon: '#ffcf8a',
    sun: { x: 0.22, alt: 0.05, r: 56, color: 'rgba(255,172,96,0.95)' },
    ambient: '#6b3d58', ambientAmt: 0.34,
    faceTop: 0.96, faceL: 0.99, faceR: 0.66,
    groundTint: 'rgba(255,150,90,0.13)',
    shadow: 0.26, shadowDir: [-1.5, 0.6],
    windowLit: 0.52, glow: 0.5,
    fog: 'rgba(255,170,110,0.13)',
    street: 0.4,
    glass: [22, 28, 48],
  },
  night: {
    key: 'night', label: '夜景',
    sky: ['#03060f', '#070f22', '#0d1a35', '#152743', '#26405e'],
    horizon: '#2f4a68',
    sun: { x: 0.80, alt: 0.55, r: 22, color: 'rgba(228,238,255,0.6)' },
    ambient: '#16233c', ambientAmt: 0.52,
    faceTop: 0.46, faceL: 0.36, faceR: 0.28,
    groundTint: 'rgba(30,50,90,0.24)',
    shadow: 0.16, shadowDir: [0.9, 0.4],
    windowLit: 0.88, glow: 1.0,
    fog: 'rgba(40,70,120,0.18)',
    street: 1.0,
    glass: [214, 16, 15],
  },
};

export const WEATHERS = {
  clear: { key: 'clear', label: '晴れ', icon: '☀', cloud: 0.18, rain: 0, snow: 0, desat: 0, dim: 0 },
  cloudy: { key: 'cloudy', label: 'くもり', icon: '☁', cloud: 0.74, rain: 0, snow: 0, desat: 0.28, dim: 0.16 },
  rain: { key: 'rain', label: '雨', icon: '☂', cloud: 0.92, rain: 1, snow: 0, desat: 0.42, dim: 0.3 },
  snow: { key: 'snow', label: '雪', icon: '❅', cloud: 0.86, rain: 0, snow: 1, desat: 0.5, dim: 0.14 },
};

/** 月 → 時間帯（季節で日照が変わる） */
export function timeOfMonth(m) {
  if (m === 12 || m <= 2) return TIMES.night;      // 冬は日が短い
  if (m <= 5) return TIMES.morning;                // 春
  if (m <= 8) return TIMES.noon;                   // 夏
  return TIMES.evening;                            // 秋
}
/** 月 → 季節名 */
export function seasonOfMonth(m) {
  if (m === 12 || m <= 2) return '冬';
  if (m <= 5) return '春';
  if (m <= 8) return '夏';
  return '秋';
}

/** HSL文字列を作る小道具 */
export function hsl(h, s, l, a = 1) {
  return a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

/** 明度係数を掛けた色 */
export function shade(h, s, l, mul, a = 1) {
  return hsl(h, s * (mul > 1 ? 0.92 : 1), Math.max(2, Math.min(96, l * mul)), a);
}

/**
 * 用途ごとの外壁ベースHSL。
 *
 * **暖色（茶系）に寄せすぎないこと。** 以前ここが 28〜38度の茶色だったため、
 * 街全体が泥のような色に見えていた。実際の街並みは、白・生成り・灰・
 * 淡い青灰が入り混じっていて、茶色一色にはならない。
 * 明度は 78 以上を基準にする。窓と影で必ず暗く落ちるので、
 * ここを暗くすると引きの絵で真っ黒な塊になる。
 */
export const USE_HSL = {
  office: [212, 7, 82],
  resi: [40, 6, 85],
  rental: [206, 5, 84],
  retail: [24, 8, 83],
  hotel: [350, 6, 84],
  logi: [204, 5, 79],
  house: [36, 9, 86],
  mixed: [224, 5, 83],
};

/**
 * 外壁の色のばらつき。
 * 同じ用途でも1棟ずつ色が違わないと、街が量産品に見える。
 * l の幅を狭めると、今度は街が砂糖菓子のように白一色になる。
 * g はガラスの濃さ（濃色ガラスのビルを混ぜるための係数）。
 */
export const WALL_TONES = [
  { h: 0, s: 0.25, l: 1.09, g: 1.02 },    // 白い吹付け
  { h: 10, s: 1.40, l: 0.99, g: 0.96 },   // 生成りのタイル
  { h: -5, s: 0.65, l: 0.90, g: 0.94 },   // 灰色のPC板
  { h: 18, s: 2.10, l: 0.81, g: 0.88 },   // 茶系のタイル
  { h: -16, s: 1.90, l: 0.87, g: 1.00 },  // 青灰のパネル
  { h: 3, s: 0.35, l: 0.96, g: 0.92 },    // 打ち放し
  { h: -2, s: 0.80, l: 0.71, g: 0.72 },   // 濃い石張り
  { h: 14, s: 1.15, l: 1.05, g: 1.06 },   // 白いタイル
];

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
    faceTop: 1.04, faceL: 0.80, faceR: 0.60,
    groundTint: 'rgba(120,150,200,0.10)',
    shadow: 0.24, shadowDir: [1.1, 0.5],
    windowLit: 0.10, glow: 0.2,
    fog: 'rgba(150,175,210,0.16)',
    street: 0.0,
  },
  noon: {
    key: 'noon', label: '正午',
    sky: ['#1c4a92', '#3d78c4', '#74a8dd', '#a8cbe8', '#d5e6f2'],
    horizon: '#e3eef7',
    sun: { x: 0.52, alt: 0.62, r: 32, color: 'rgba(255,255,244,0.6)' },
    ambient: '#bcd2e8', ambientAmt: 0.16,
    faceTop: 1.16, faceL: 0.92, faceR: 0.74,
    groundTint: 'rgba(255,250,235,0.06)',
    shadow: 0.30, shadowDir: [0.65, 0.35],
    windowLit: 0.018, glow: 0.05,
    fog: 'rgba(200,225,245,0.10)',
    street: 0.0,
  },
  evening: {
    key: 'evening', label: '夕景',
    sky: ['#1a1230', '#4a2450', '#963d56', '#e0714a', '#ffb867'],
    horizon: '#ffcf8a',
    sun: { x: 0.22, alt: 0.05, r: 56, color: 'rgba(255,172,96,0.95)' },
    ambient: '#6b3d58', ambientAmt: 0.34,
    faceTop: 0.98, faceL: 0.96, faceR: 0.52,
    groundTint: 'rgba(255,150,90,0.13)',
    shadow: 0.34, shadowDir: [-1.5, 0.6],
    windowLit: 0.52, glow: 0.5,
    fog: 'rgba(255,170,110,0.13)',
    street: 0.4,
  },
  night: {
    key: 'night', label: '夜景',
    sky: ['#03060f', '#070f22', '#0d1a35', '#152743', '#26405e'],
    horizon: '#2f4a68',
    sun: { x: 0.80, alt: 0.55, r: 22, color: 'rgba(228,238,255,0.6)' },
    ambient: '#16233c', ambientAmt: 0.52,
    faceTop: 0.44, faceL: 0.34, faceR: 0.26,
    groundTint: 'rgba(30,50,90,0.24)',
    shadow: 0.16, shadowDir: [0.9, 0.4],
    windowLit: 0.88, glow: 1.0,
    fog: 'rgba(40,70,120,0.18)',
    street: 1.0,
  },
};

export const WEATHERS = {
  clear: { key: 'clear', label: '晴れ', icon: '☀', cloud: 0.18, rain: 0, snow: 0, desat: 0, dim: 0 },
  cloudy: { key: 'cloudy', label: 'くもり', icon: '☁', cloud: 0.74, rain: 0, snow: 0, desat: 0.28, dim: 0.16 },
  rain: { key: 'rain', label: '雨', icon: '☂', cloud: 0.92, rain: 1, snow: 0, desat: 0.42, dim: 0.3 },
  snow: { key: 'snow', label: '雪', icon: '❅', cloud: 0.86, rain: 0, snow: 1, desat: 0.5, dim: 0.14 },
};

/** 四半期 → 時間帯 */
export function timeOfQuarter(q) {
  return [TIMES.morning, TIMES.noon, TIMES.evening, TIMES.night][(q - 1) % 4];
}

/** HSL文字列を作る小道具 */
export function hsl(h, s, l, a = 1) {
  return a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

/** 明度係数を掛けた色 */
export function shade(h, s, l, mul, a = 1) {
  return hsl(h, s * (mul > 1 ? 0.92 : 1), Math.max(2, Math.min(96, l * mul)), a);
}

/** 用途ごとの外壁ベースHSL */
export const USE_HSL = {
  office: [210, 11, 60],
  resi: [34, 8, 66],
  rental: [200, 8, 62],
  retail: [26, 15, 60],
  hotel: [345, 9, 60],
  logi: [206, 5, 56],
  house: [38, 13, 68],
  mixed: [250, 9, 61],
};

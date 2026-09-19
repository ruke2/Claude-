// ============================================================
//  シード付き乱数（mulberry32）— リプレイ可能な乱数列
// ============================================================
export class RNG {
  constructor(seed = Date.now()) { this.s = seed >>> 0; }

  /** 0以上1未満 */
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min以上max以下の実数 */
  range(min, max) { return min + this.next() * (max - min); }

  /** min以上max以下の整数 */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  /** 確率pで真 */
  chance(p) { return this.next() < p; }

  /** 配列から1つ */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** 重み付き抽選 [{w:数値,...}] */
  weighted(arr, key = 'w') {
    const total = arr.reduce((s, a) => s + (a[key] ?? 1), 0);
    let r = this.next() * total;
    for (const a of arr) { r -= (a[key] ?? 1); if (r <= 0) return a; }
    return arr[arr.length - 1];
  }

  /** 配列をシャッフル（非破壊） */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** 平均mean・標準偏差sdの正規分布（Box-Muller） */
  normal(mean = 0, sd = 1) {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** mean中心・[lo,hi]でクリップした正規分布 */
  clampNormal(mean, sd, lo, hi) {
    return Math.max(lo, Math.min(hi, this.normal(mean, sd)));
  }
}

/** 座標から決定的な擬似乱数（描画ディテール用・状態を持たない） */
export function hash2(x, y, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

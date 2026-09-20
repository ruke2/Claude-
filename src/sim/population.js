// ============================================================
//  人口と世帯数
//    地区ごとに人が増えたり減ったりする。
//    人が増えれば住宅と商業の需要が上がり、減れば空室が増える。
//
//    動かす力は3つ。
//      1) 都市全体の趨勢（湊都市は微増、鶴見野市は微減）
//      2) 地区の引力（駅力・新線・地区の性格）
//      3) 供給（住宅を建てれば人が入る／建てすぎれば1棟あたりが薄くなる）
//
//    **人口を賃料や分譲単価に直接掛けないこと。**
//    掛け算で効かせると、人口が1割動いただけで事業収支がひっくり返る。
//    ここが返すのは `demandMul()` の穏やかな倍率で、
//    稼働率と成約速度に効かせるのが主な役目である。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, CITIES, TERRAIN, cityOf } from '../data/city.js';
import { WEEKS_PER_YEAR, WEEKS_PER_QUARTER } from '../core/time.js';
import { railsOf } from './cityevents.js';

/** 1世帯あたりの人数（地区の性格で変わる） */
const HOUSEHOLD_SIZE = {
  house: 2.9, resi: 2.3, rental: 1.6, mixed: 1.9,
  office: 1.5, retail: 1.7, hotel: 1.7, logi: 2.2,
};

/**
 * 地図は街の縮図である。
 * 区画から出した人数をそのまま出すと、
 * 「人口60万の中核市」と書いてある鶴見野市が2万7千人の町になってしまう。
 * 都市の規模に合わせて引き伸ばす（鶴見野市が約60万人になる倍率）。
 */
const POP_SCALE = 30;

/** 都市ごとの趨勢（年あたり） */
const CITY_TREND = { minato: 0.0042, tsurumino: -0.0062, hinoura: -0.0085, yakumo: -0.0105 };

/**
 * 地区の性格から、人がどれだけ住む場所かを決める。
 * **住宅系の適合を足し上げて1.0に張り付かせないこと。**
 * オフィス街でも分譲・賃貸の適合が0.6前後はあるので、
 * 素直に足すと常盤のようなビジネス街まで住宅地と同じ重みになり、
 * CBDの人口が四半世紀で3割増えるような絵になる。
 */
function residentialWeight(d) {
  const f = d.fit;
  const w = clamp01(f.house * 0.55 + f.resi * 0.45 + f.rental * 0.35);
  // 2乗して差を広げる。線形のままだと、住宅適合が中くらいのビジネス街にも
  // 住宅地の半分の人口が住んでいることになってしまう
  return w * w;
}

/**
 * 地区の人口を作る。新規ゲームと、人口の無い古いセーブの両方で使う。
 * 区画数 × 容積率 × 住宅の色合い で初期値を置く。
 */
export function seedPopulation(g) {
  const pop = {};
  for (const id in DISTRICTS) {
    const d = DISTRICTS[id];
    const cells = (g.cells || []).filter(c => c.d === id && c.terrain === TERRAIN.LOT);
    const area = cells.reduce((a, c) => a + (c.area || 0), 0);
    const far = (d.farRange[0] + d.farRange[1]) / 2 / 100;
    const w = residentialWeight(d);
    // 延床のうち住宅になっている割合ぶんに人が住んでいるとみなす。
    // 1人あたり 12坪（専有）で置く
    const people = Math.round(area * far * w * 0.52 / 12 * POP_SCALE);
    const size = HOUSEHOLD_SIZE[bestResiUse(d)] || 2.1;
    pop[id] = {
      people: Math.max(1200, people),
      households: Math.max(600, Math.round(people / size)),
      size: Math.round(size * 100) / 100,
      trend: 0,                     // 直近1年の増減率
      base: Math.max(1200, people),  // 創業時の人口（増減率の表示に使う）
    };
  }
  return pop;
}

/** その地区でいちばん厚い住宅系の用途 */
function bestResiUse(d) {
  let best = 'resi', bv = -1;
  for (const u of ['house', 'resi', 'rental', 'mixed']) {
    if ((d.fit[u] ?? 0) > bv) { bv = d.fit[u] ?? 0; best = u; }
  }
  return best;
}

/** 人口が置かれていなければ置く */
export function ensurePopulation(g) {
  if (!g.pop || !Object.keys(g.pop).length) g.pop = seedPopulation(g);
  // 地区を足したときは、足りないぶんだけ作る
  const seeded = seedPopulation(g);
  for (const id in seeded) if (!g.pop[id]) g.pop[id] = seeded[id];
  return g.pop;
}

/**
 * 地区の引力。人がそこへ移りたいと思う度合い（-1〜+1 のあたり）。
 * 駅力・新線・住宅の厚み・地価の高さで決まる。
 */
export function pullOf(g, id) {
  const d = DISTRICTS[id];
  if (!d) return 0;
  const p = (g.pop || {})[id];
  const station = d.station;
  // 新線は開業前から人を呼ぶ
  let rail = 0;
  for (const r of railsOf(g)) {
    if (!r.districts.includes(id)) continue;
    rail += r.status === 'open' ? r.lift * 1.2 : r.status === 'building' ? r.lift * 0.5 * (r.progress || 0) : 0;
  }
  // 住みやすさ：住宅の厚みと、地価の安さ
  const live = residentialWeight(d);
  const afford = clamp(1 - Math.log10(Math.max(0.2, d.landPrice)) / 1.6, -0.4, 0.7);
  // 混みすぎると出ていく
  const crowd = p && p.base ? clamp((p.people / p.base - 1) * -0.6, -0.5, 0.3) : 0;
  return clamp(station * 0.5 + rail * 2.2 + live * 0.5 + afford * 0.35 + crowd - 0.62, -0.9, 0.9);
}

/**
 * 毎週の人口更新。
 * 四半期に1回だけ動かす（毎週動かすと表示がちらつくうえ、意味も無い）。
 */
export function stepPopulation(g, rng, news) {
  if (g.week % WEEKS_PER_QUARTER !== 0) return null;
  const pop = ensurePopulation(g);
  const moved = [];
  for (const id in pop) {
    const d = DISTRICTS[id];
    const p = pop[id];
    const city = cityOf(id);
    const trendY = (CITY_TREND[city] ?? 0) + pullOf(g, id) * 0.016;
    // 景気が良い年は人の動きが大きくなる
    const heat = 0.75 + g.market.sentiment * 0.5;
    const rate = trendY / 4 * heat + rng.normal(0, 0.0016);   // 四半期あたり
    const before = p.people;
    p.people = Math.max(600, Math.round(p.people * (1 + rate)));
    // 世帯の小規模化（単身と二人世帯が増えていく）
    p.size = Math.max(1.35, Math.round((p.size - 0.0016) * 1000) / 1000);
    p.households = Math.max(300, Math.round(p.people / p.size));
    p.trend = Math.round((p.people / Math.max(1, before) - 1) * 4 * 10000) / 100;   // 年率%
    if (Math.abs(p.people - before) / Math.max(1, before) > 0.012) {
      moved.push({ id, short: d.short, d: p.people - before });
    }
  }
  // 大きく動いた地区だけ知らせる（毎回全地区を並べても読まれない）
  moved.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = moved[0];
  if (top && news && rng.chance(0.5)) {
    news.push({
      icon: top.d > 0 ? '👥' : '🏚',
      type: 'market',
      text: top.d > 0
        ? `${top.short}の人口が四半期で${top.d.toLocaleString()}人増えた。住宅と商業の引き合いが強まっている。`
        : `${top.short}の人口が四半期で${Math.abs(top.d).toLocaleString()}人減った。空室が出やすくなる。`,
    });
  }
  return moved;
}

/**
 * 地区の人口が需要に与える倍率。
 * 創業時の人口を1.00として、増減をゆるやかに効かせる。
 *
 * **ここを大きく振らないこと。** 0.88〜1.14 に収めてある。
 * 人口が1割動いただけで事業収支がひっくり返ると、
 * プレイヤーには何が起きたのか分からなくなる。
 */
export function demandMul(g, id, use) {
  const p = (g.pop || {})[id];
  if (!p || !p.base) return 1;
  const ratio = p.people / p.base;
  // 用途によって人口の効き方が違う。住宅と商業は直に効き、物流とオフィスは鈍い
  const k = { house: 1.0, resi: 0.95, rental: 0.9, retail: 0.8, hotel: 0.45, mixed: 0.7, office: 0.35, logi: 0.2 }[use] ?? 0.6;
  return clamp(1 + (ratio - 1) * k, 0.88, 1.14);
}

/** 都市ごとの合計 */
export function cityTotals(g) {
  const out = {};
  for (const cid in CITIES) out[cid] = { people: 0, households: 0, base: 0 };
  for (const id in (g.pop || {})) {
    const c = cityOf(id);
    if (!out[c]) continue;
    out[c].people += g.pop[id].people;
    out[c].households += g.pop[id].households;
    out[c].base += g.pop[id].base;
  }
  return out;
}

/** 表示用：人口の多い順に並べた地区 */
export function populationRows(g) {
  const rows = [];
  for (const id in (g.pop || {})) {
    const d = DISTRICTS[id];
    if (!d) continue;
    const p = g.pop[id];
    rows.push({
      id, short: d.short, name: d.name, city: cityOf(id),
      people: p.people, households: p.households, size: p.size,
      change: p.base ? (p.people / p.base - 1) * 100 : 0,
      pull: pullOf(g, id),
    });
  }
  rows.sort((a, b) => b.people - a.people);
  return rows;
}

export { WEEKS_PER_YEAR };

// ============================================================
//  街に起きること — 災害と、新駅・新線の開業
//    保有するとは、その街のリスクを引き受けることでもある。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN, cityOf } from '../data/city.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';
import { uid } from '../core/state.js';

// ------------------------------------------------------------
//  ハザード — 地区ごとの弱さ
// ------------------------------------------------------------
/**
 * 地区ごとの災害の受けやすさ（1.0 = 標準）。
 * 埋立地は揺れに弱く、海沿いは風水害に弱い。
 */
export const HAZARD = {
  T: { quake: 0.85, storm: 0.70, flood: 0.55 },   // 常盤：地盤も対策も良い
  B: { quake: 1.35, storm: 1.30, flood: 1.45 },   // 汐見：埋立の湾岸
  A: { quake: 0.70, storm: 0.85, flood: 0.35 },   // 青葉台：高台
  K: { quake: 1.15, storm: 0.95, flood: 0.90 },   // 神楽坂：古い街並み
  N: { quake: 0.95, storm: 1.00, flood: 0.80 },
  I: { quake: 1.05, storm: 1.10, flood: 1.05 },
  S: { quake: 0.90, storm: 0.95, flood: 0.85 },
  J: { quake: 1.45, storm: 1.25, flood: 1.55 },   // 城東：低地の埋立
  F: { quake: 0.65, storm: 0.80, flood: 0.30 },   // 藤ヶ丘：丘陵
  M: { quake: 0.85, storm: 0.90, flood: 0.70 },
  E: { quake: 1.30, storm: 1.45, flood: 1.60 },   // 空港：海上の埋立
  W: { quake: 1.20, storm: 1.15, flood: 1.35 },   // 若葉町：川沿いの旧市街
  Y: { quake: 1.00, storm: 1.05, flood: 0.95 },
  H: { quake: 0.75, storm: 0.90, flood: 0.45 },
  R: { quake: 1.40, storm: 1.35, flood: 1.50 },   // 臨港：埋立
  G: { quake: 0.90, storm: 0.95, flood: 0.75 },
  P: { quake: 0.80, storm: 0.85, flood: 0.60 },   // 官庁街：耐震改修済みの庁舎が多い
  Z: { quake: 1.25, storm: 1.05, flood: 1.10 },   // 銀鈴町：古い雑居ビルが密集
  V: { quake: 1.40, storm: 1.30, flood: 1.50 },   // 汐凪：埋立の湾岸
  Q: { quake: 0.95, storm: 1.15, flood: 0.90 },
  L: { quake: 0.95, storm: 1.00, flood: 0.85 },
  C: { quake: 0.70, storm: 0.90, flood: 0.35 },   // 千歳丘：丘を削った造成地
  D: { quake: 0.95, storm: 1.10, flood: 0.90 },   // 陽ノ浦駅前
  O: { quake: 1.30, storm: 1.50, flood: 1.55 },   // 陽ノ浦港：海に面した低地
  U: { quake: 1.10, storm: 1.20, flood: 1.30 },   // 湯ノ川：川沿い
  X: { quake: 1.05, storm: 1.55, flood: 1.40 },   // 白浜：砂浜に面する
  1: { quake: 0.90, storm: 0.85, flood: 0.80 },   // 八雲駅前
  2: { quake: 0.95, storm: 0.85, flood: 0.90 },
  3: { quake: 0.85, storm: 0.80, flood: 0.70 },
  4: { quake: 0.65, storm: 0.80, flood: 0.30 },   // 白鷺台：台地
};
export const hazardOf = d => HAZARD[d] || { quake: 1, storm: 1, flood: 1 };

/** 災害の種類 */
export const DISASTERS = [
  {
    id: 'quake', name: '地震', icon: '🌋', key: 'quake', p: 0.055, minWeek: 52,
    titles: ['湊都直下地震', '湾岸沖地震', '県南部を震源とする地震'],
    seismicMatters: true,
    desc: '建物の損傷に加え、テナントの退去と復旧工事が発生する。',
  },
  {
    id: 'typhoon', name: '台風', icon: '🌀', key: 'storm', p: 0.10, months: [7, 8, 9, 10],
    titles: ['大型台風の直撃', '記録的暴風雨', '猛烈な台風の接近'],
    seismicMatters: false,
    desc: '外装材の飛散と浸水。工事中の案件は工期が延びる。',
  },
  {
    id: 'flood', name: '豪雨・浸水', icon: '🌊', key: 'flood', p: 0.075, months: [6, 7, 8, 9],
    titles: ['線状降水帯による豪雨', '記録的短時間大雨', '河川の氾濫'],
    seismicMatters: false,
    desc: '地下と低層部が浸水する。低地の物件ほど被害が大きい。',
  },
  {
    id: 'snow', name: '大雪', icon: '❄', key: 'storm', p: 0.05, months: [12, 1, 2],
    titles: ['記録的な大雪', '大雪による交通麻痺'],
    seismicMatters: false,
    desc: '物流と工事が止まる。建物への直接の被害は小さい。',
  },
];

/** 耐震改修の費用（簿価に対する率）と効果 */
export const RETROFIT = { cost: 0.085, gain: 0.45, weeks: 26 };

/** 物件の耐震性能。古い建物ほど弱い */
export function seismicOf(a) {
  if (typeof a.seismic === 'number') return a.seismic;
  const age = a.age || 0;
  return clamp(1.0 - Math.max(0, age - 12) * 0.012, 0.55, 1.0);
}

/**
 * 災害を起こす。四半期あたりの確率を週次に割り戻し、
 * 季節のある災害は月で絞る。
 */
export function rollDisaster(g, rng, news) {
  for (const D of DISASTERS) {
    if (D.minWeek && g.week < D.minWeek) continue;
    if (D.months && !D.months.includes(g.month)) continue;
    if (!rng.chance(D.p / WEEKS_PER_QUARTER)) continue;
    return applyDisaster(g, D, rng, news);
  }
  return null;
}

/** 実際の被害を計算して当てる */
function applyDisaster(g, D, rng, news) {
  const severity = rng.range(0.35, 1.0);          // その災害の強さ
  const title = rng.pick(D.titles);
  const hits = [];
  let loss = 0, vacancyHit = 0;

  for (const a of g.assets || []) {
    const h = hazardOf(a.district)[D.key];
    const seis = D.seismicMatters ? seismicOf(a) : 1;
    // 被害率：災害の強さ × 地区のもろさ ÷ 建物の性能
    let rate = severity * h * 0.052 / Math.max(0.4, seis);
    if (D.id === 'flood') rate *= (a.use === 'logi' || a.use === 'retail') ? 1.4 : 0.8;
    if (D.id === 'snow') rate *= 0.25;
    rate = clamp(rate * rng.range(0.4, 1.6), 0, 0.42);
    if (rate < 0.008) continue;

    const book = (a.bookBuild || 0);
    const cost = Math.round(book * rate);
    if (cost <= 0) continue;
    a.bookBuild = Math.max(0, book - cost);
    a.damage = (a.damage || 0) + cost;
    // 復旧までテナントが抜ける
    const occDrop = clamp(rate * 1.4, 0, 0.5);
    a.occupancy = clamp01(a.occupancy - occDrop);
    a.repairUntil = g.week + Math.round(6 + rate * 60);
    loss += cost; vacancyHit += occDrop;
    hits.push({ name: a.name, district: a.district, cost, rate });
  }

  // 工事中の案件は工期が延びる
  let delayed = 0;
  for (const pj of g.projects || []) {
    const h = hazardOf(pj.district)[D.key];
    if (!rng.chance(clamp01(severity * h * 0.35))) continue;
    const w = Math.round(1 + severity * h * 6);
    pj.weeks += w; delayed++;
  }

  if (loss > 0) {
    g.cash -= loss;
    g.finance.quarterAcc.extraordinary -= loss;
  }
  // 市況も一時的に冷える
  g.market.sentiment = clamp01(g.market.sentiment - severity * 0.12);

  const rec = {
    id: uid('D'), kind: D.id, name: D.name, icon: D.icon, title,
    year: g.year, week: g.week, severity,
    loss, hits: hits.length, delayed,
    worst: hits.sort((a, b) => b.cost - a.cost)[0] || null,
  };
  g.disasters = g.disasters || [];
  g.disasters.push(rec);
  if (g.disasters.length > 60) g.disasters.shift();

  news && news.push({
    icon: D.icon, type: 'disaster', major: true,
    text: `【${title}】${D.desc}`
      + (hits.length ? `保有${hits.length}件が被災し、復旧費${Math.round(loss / 100).toLocaleString()}億円を特別損失に計上した。` : '当社の保有物件に大きな被害はなかった。')
      + (delayed ? `工事中の${delayed}件で工期が延びた。` : ''),
  });
  return rec;
}

/** 耐震改修できる物件 */
export function retrofitTargets(g) {
  return (g.assets || []).filter(a => seismicOf(a) < 0.92 && !a.retrofitUntil);
}

/** 耐震改修の費用 */
export function retrofitCost(a) {
  return Math.round((a.bookBuild || 0) * RETROFIT.cost);
}

/** 耐震改修を発注する */
export function retrofit(g, a, news) {
  const cost = retrofitCost(a);
  if (cost <= 0) return '改修の必要がない';
  if (g.cash < cost) return '資金が不足している';
  g.cash -= cost;
  g.finance.quarterAcc.cogsLease += cost * 0.35;
  a.bookBuild += Math.round(cost * 0.65);        // 資本的支出として一部を簿価へ
  a.seismic = clamp(seismicOf(a) + RETROFIT.gain, 0, 1.15);
  a.retrofitUntil = g.week + RETROFIT.weeks;
  news && news.push({
    icon: '🔧', type: 'lease',
    text: `「${a.name}」の耐震改修に着手した（工事費${Math.round(cost / 100).toLocaleString()}億円）。耐震性能が${(a.seismic * 100).toFixed(0)}に上がる。`,
  });
  return null;
}

// ------------------------------------------------------------
//  新駅・新線
// ------------------------------------------------------------
/**
 * 鉄道の整備計画。
 * 発表 → 工事（数年）→ 開業。開業で周辺の駅力が上がり、
 * 地価と賃料がまとめて持ち上がる。
 * 発表の時点で気づけた人が、静かに仕込める。
 */
export const RAIL_PLANS = [
  { id: 'r1', name: '湊都環状線 汐見延伸', districts: ['B', 'J'], lift: 0.16, icon: '🚇' },
  { id: 'r2', name: '若葉町・北野連絡線', districts: ['W', 'N'], lift: 0.22, icon: '🚃' },
  { id: 'r3', name: '空港アクセス新線', districts: ['E', 'I'], lift: 0.20, icon: '🚄' },
  { id: 'r4', name: '南雲リサーチライン', districts: ['M', 'S'], lift: 0.15, icon: '🚈' },
  { id: 'r5', name: '藤ヶ丘新駅の設置', districts: ['F', 'A'], lift: 0.18, icon: '🚉' },
  { id: 'r6', name: '城東貨物線の旅客化', districts: ['J', 'W'], lift: 0.14, icon: '🚞' },
  { id: 'r7', name: '鶴見野環状線', districts: ['Y', 'G', 'H'], lift: 0.19, icon: '🚝' },
];

/** 進行中・完成した鉄道計画 */
export function railsOf(g) { return g.rails || []; }

/** その地区に関わる計画 */
export function railsFor(g, d) {
  return railsOf(g).filter(r => r.districts.includes(d));
}

/**
 * 毎週の処理。
 *  ・ごくまれに新しい計画が発表される
 *  ・工事が進み、開業すると周辺の駅力が上がる
 */
export function stepRails(g, rng, news) {
  g.rails = g.rails || [];
  const running = g.rails.filter(r => r.status === 'building');

  // 新しい計画の発表（同時に2本までしか走らない）
  if (running.length < 2 && rng.chance(0.30 / WEEKS_PER_QUARTER)) {
    const done = new Set(g.rails.map(r => r.id));
    const pool = RAIL_PLANS.filter(p => !done.has(p.id)
      && p.districts.every(d => DISTRICTS[d])
      // 鶴見野の路線は、そこへ進出していないと話題にもならない
      && (cityOf(p.districts[0]) === 'minato' || (g.unlocked || []).includes('city2')));
    if (pool.length) {
      const p = rng.pick(pool);
      const years = rng.int(4, 7);
      const rec = {
        ...p, status: 'building',
        announcedWeek: g.week, announcedYear: g.year,
        openWeek: g.week + years * WEEKS_PER_YEAR,
        openYear: g.year + years,
      };
      g.rails.push(rec);
      news && news.push({
        icon: p.icon, type: 'rail', major: true,
        text: `【${p.name}】の事業計画が認可された。${rec.openYear}年ごろの開業見込みで、`
          + `${p.districts.map(d => DISTRICTS[d].name).join('・')}の利便性が大きく上がる。`
          + `沿線の地価は開業に向けてじわじわ動きはじめる。`,
      });
    }
  }

  // 工事の進捗と開業
  for (const r of g.rails) {
    if (r.status !== 'building') continue;
    const total = Math.max(1, r.openWeek - r.announcedWeek);
    r.progress = clamp01((g.week - r.announcedWeek) / total);
    // 期待による先取り（開業までに lift の4割が織り込まれる）
    if (g.week >= r.openWeek) {
      r.status = 'open';
      r.openedWeek = g.week;
      r.openedYear = g.year;
      applyRail(g, r, 1.0);
      news && news.push({
        icon: r.icon, type: 'rail', major: true,
        text: `【${r.name}】が開業した。${r.districts.map(d => DISTRICTS[d].name).join('・')}の駅力が上がり、`
          + `地価・賃料ともに上昇した。沿線に仕込んでいた用地は含み益になる。`,
      });
    }
  }
  return null;
}

/**
 * 沿線の区画に効かせる。
 * 駅力（station）が上がると、地価も賃料も分譲単価も一緒に上がる。
 */
function applyRail(g, r, ratio) {
  const lift = r.lift * ratio;
  for (const c of g.cells || []) {
    if (c.terrain !== TERRAIN.LOT || !c.d) continue;
    if (!r.districts.includes(c.d)) continue;
    const before = c.station;
    c.station = clamp01(c.station + lift * (1 - c.station) * 1.1);
    // 想定地価は駅力に連動している
    if (c.baseValue) c.baseValue = Math.round(c.baseValue * (1 + (c.station - before) * 0.85));
  }
}

/** 開業までの期待による先取り（毎週わずかに効く） */
export function railExpectation(g) {
  const out = {};
  for (const r of railsOf(g)) {
    if (r.status !== 'building') continue;
    for (const d of r.districts) {
      out[d] = (out[d] || 0) + r.lift * 0.35 * (r.progress || 0);
    }
  }
  return out;
}

/** その地区の期待の上乗せ（valuation から呼ぶ） */
export function railMul(g, d) {
  const e = railExpectation(g);
  return 1 + (e[d] || 0);
}

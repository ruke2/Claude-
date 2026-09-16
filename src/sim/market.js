// ============================================================
//  市況シミュレーション — 景気循環・価格・建設費・金利・需要
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { perWeek, WEEKS_PER_QUARTER } from '../core/time.js';

const PHASES = [
  { lo: 0.00, name: '回復', tone: 'cyan',  desc: '底を打った市況が上向き始めている。' },
  { lo: 0.25, name: '好況', tone: 'green', desc: '地価も賃料も上昇基調。用地の取り合いが激しい。' },
  { lo: 0.55, name: '過熱', tone: 'amber', desc: '取得価格が理論値を超えつつある。高値掴みに注意。' },
  { lo: 0.72, name: '後退', tone: 'red',   desc: '契約が鈍り、金融機関の姿勢も厳しくなってきた。' },
  { lo: 0.88, name: '不況', tone: 'grey',  desc: '在庫が重い。ただし仕込みの好機でもある。' },
];

export function phaseOf(cycle) {
  let p = PHASES[0];
  for (const q of PHASES) if (cycle >= q.lo) p = q;
  return p;
}

// 週あたりの追随率（四半期あたりの値から換算）
const K_PRICE = perWeek(0.17);
const K_RATE = perWeek(0.22);
const K_DEMAND = perWeek(0.55);

/** 毎週の市況更新 */
export function stepMarket(g, rng) {
  const m = g.market;
  const d = g.diff;
  const W = WEEKS_PER_QUARTER;

  // 景気位相（1周 = 約10年 = 520週）
  m.cycle = (m.cycle + 1 / 520 + rng.range(-0.0006, 0.0008)) % 1;
  const ph = phaseOf(m.cycle);
  m.phaseName = ph.name; m.phaseTone = ph.tone; m.phaseDesc = ph.desc;

  // 価格指数：サイクルに追随しつつ慣性を持つ
  const target = 0.86 + Math.sin(m.cycle * Math.PI * 2 - Math.PI / 2) * 0.26 + 0.08 + g.week * 0.00023;
  m.priceIdx += (target - m.priceIdx) * K_PRICE + rng.normal(0, 0.0034 * d.costVol);
  m.priceIdx = clamp(m.priceIdx, 0.55, 2.6);

  // 建設費：長期的に上がり続ける。好況局面で加速
  const costPush = (0.0030 + Math.max(0, Math.sin(m.cycle * Math.PI * 2)) * 0.008) / W;
  m.costIdx *= 1 + costPush + rng.normal(0, 0.0025 * d.costVol);
  m.costIdx = clamp(m.costIdx, 0.85, 3.2);

  // 長期金利
  const rTarget = d.rate + Math.max(0, m.priceIdx - 1) * 0.022 + (ph.name === '過熱' ? 0.006 : 0);
  m.rate += (rTarget - m.rate) * K_RATE + rng.normal(0, 0.00034);
  m.rate = clamp(m.rate, 0.002, 0.075);

  // 用途別需要：目標値へ緩やかに寄せる
  const base = d.demand;
  const c = Math.sin(m.cycle * Math.PI * 2 - Math.PI / 2);
  const targets = {
    office: base * (1 + c * 0.24),
    resi: base * (1 + c * 0.15),
    rental: base * (1 + c * 0.07),
    retail: base * (1 + c * 0.2),
    hotel: base * (1 + Math.sin(m.cycle * Math.PI * 2 + 1.1) * 0.34),
    logi: 1.04 + g.week * 0.00017,
    house: base * (1 + c * 0.1),
  };
  const lim = {
    office: [0.55, 1.6], resi: [0.55, 1.55], rental: [0.7, 1.35], retail: [0.5, 1.55],
    hotel: [0.4, 1.9], logi: [0.75, 1.5], house: [0.6, 1.4],
  };
  for (const k in targets) {
    const v = m.demand[k] + (targets[k] - m.demand[k]) * K_DEMAND + rng.normal(0, 0.008);
    m.demand[k] = clamp(v, lim[k][0], lim[k][1]);
  }
  m.demand.mixed = (m.demand.office + m.demand.retail + m.demand.resi) / 3;

  m.sentiment = clamp01(m.sentiment + ((0.5 + c * 0.32) - m.sentiment) * K_DEMAND + rng.normal(0, 0.012));
  m.capShift = clamp((1 - m.priceIdx) * 0.006 + (m.rate - d.rate) * 0.35, -0.008, 0.014);
  return ph;
}

/** 市況ショック（四半期ごとに低確率で発生） */
export const SHOCKS = [
  {
    id: 'crisis', p: 0.030, minWeek: 104, icon: '📉', title: '世界的な金融不安',
    text: '海外発の信用不安により不動産価格が急落。金融機関の融資姿勢も一気に厳格化した。',
    apply: (g) => { g.market.priceIdx *= 0.86; g.market.rate += 0.012; for (const k in g.market.demand) g.market.demand[k] *= 0.85; },
  },
  {
    id: 'inbound', p: 0.055, icon: '✈', title: 'インバウンド需要が爆発',
    text: '訪日客数が過去最高を更新。ホテルと都心商業の収益が跳ね上がっている。',
    apply: (g) => { g.market.demand.hotel *= 1.35; g.market.demand.retail *= 1.18; },
  },
  {
    id: 'costup', p: 0.060, icon: '⚒', title: '建設資材価格が高騰',
    text: '鋼材と人件費の上昇で建築コストが一段と重くなった。進行中の案件にも影響が出る。',
    apply: (g) => { g.market.costIdx *= 1.075; },
  },
  {
    id: 'zoning', p: 0.040, icon: '📜', title: '都市計画の規制緩和',
    text: '容積率の割増制度が拡充された。大型再開発の採算性が改善する。',
    apply: (g) => { for (const c of g.cells) if (c.far) c.far = Math.round(c.far * 1.06 / 10) * 10; },
  },
  {
    id: 'quake', p: 0.022, minWeek: 156, icon: '⚠', title: '大規模地震が発生',
    text: '直接的な人的被害は限定的だったが、復旧費用と工期遅延、そして買い控えが避けられない。',
    apply: (g) => { g.market.demand.resi *= 0.82; g.market.costIdx *= 1.05; for (const p of g.projects) p.delay = (p.delay || 0) + 6; },
  },
  {
    id: 'remote', p: 0.038, icon: '💻', title: 'リモートワークが定着',
    text: 'オフィス需要が構造的に減退する一方、郊外住宅と物流への資金流入が続く。',
    apply: (g) => { g.market.demand.office *= 0.86; g.market.demand.house *= 1.12; g.market.demand.logi *= 1.1; },
  },
  {
    id: 'reitboom', p: 0.045, icon: '◎', title: 'REIT市場に資金流入',
    text: '投資法人の取得意欲が旺盛で、優良な収益物件が高値で取引されている。',
    apply: (g) => { g.market.capShift -= 0.004; g.market.priceIdx *= 1.05; },
  },
  {
    id: 'tax', p: 0.035, icon: '📊', title: '住宅取得支援税制の拡充',
    text: '一次取得層向けの減税が決まり、分譲住宅の契約が動き出した。',
    apply: (g) => { g.market.demand.resi *= 1.16; g.market.demand.house *= 1.2; },
  },
  {
    id: 'ecommerce', p: 0.040, icon: '📦', title: 'EC市場のさらなる拡大',
    text: '大型物流施設の引き合いが強く、賃料水準が切り上がっている。',
    apply: (g) => { g.market.demand.logi *= 1.18; },
  },
  {
    id: 'labor', p: 0.042, icon: '👷', title: '建設技能者の不足が深刻化',
    text: '職人の確保が難しく、各社の工期が全般に伸びている。',
    apply: (g) => { g.market.costIdx *= 1.04; for (const p of g.projects) if (Math.random() < 0.4) p.delay = (p.delay || 0) + 4; },
  },
];

export function rollShocks(g, rng) {
  const out = [];
  for (const s of SHOCKS) {
    if (s.minWeek && g.week < s.minWeek) continue;
    if (rng.chance(s.p / WEEKS_PER_QUARTER)) { s.apply(g); out.push(s); }
  }
  return out;
}

/** 天候を決める（見た目用・月ごとの確率） */
export function rollWeather(g, rng) {
  const M = [
    [['clear', 5], ['cloudy', 3], ['snow', 2]],          // 1月
    [['clear', 5], ['cloudy', 3], ['snow', 2]],          // 2月
    [['clear', 5], ['cloudy', 3], ['rain', 2]],          // 3月
    [['clear', 6], ['cloudy', 3], ['rain', 2]],          // 4月
    [['clear', 6], ['cloudy', 3], ['rain', 2]],          // 5月
    [['clear', 3], ['cloudy', 4], ['rain', 5]],          // 6月（梅雨）
    [['clear', 6], ['cloudy', 3], ['rain', 3]],          // 7月
    [['clear', 7], ['cloudy', 2], ['rain', 2]],          // 8月
    [['clear', 4], ['cloudy', 4], ['rain', 4]],          // 9月（台風）
    [['clear', 6], ['cloudy', 3], ['rain', 2]],          // 10月
    [['clear', 6], ['cloudy', 3], ['rain', 2]],          // 11月
    [['clear', 5], ['cloudy', 3], ['snow', 2]],          // 12月
  ][(g.month || 1) - 1];
  return rng.weighted(M.map(([k, w]) => ({ k, w }))).k;
}

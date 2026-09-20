// ============================================================
//  就職先人気ランキング／入社難易度ランキング
//    学生から見た「就職先」としての序列。
//    デベロッパー以外の業界も並べて、自社の立ち位置を測る。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { EMPLOYERS, INDUSTRIES } from '../data/employers.js';
import { ttmRevenue } from './company.js';

/**
 * 人気度。
 *  素の知名度 × 年収の魅力 × 直近の勢い
 * デベロッパー各社は、競合の業績と平均年収に連動して動く。
 */
function popularityOf(g, e) {
  let pop = e.pop;
  let pay = e.pay ?? 10;
  let hire = e.hire;

  if (e.rivalId) {
    const rv = (g.rivals || []).find(r => r.id === e.rivalId);
    if (rv) {
      pay = rv.avgPay || pay;
      // 伸びている会社は学生人気も上がる。縮む会社は落ちる
      const grow = rv.lastRev > 0 ? rv.rev / rv.lastRev : 1;
      const margin = rv.op / Math.max(1, rv.rev);
      pop += clamp((grow - 1) * 120, -6, 8) + clamp((margin - 0.12) * 70, -5, 7);
      hire = Math.max(6, Math.round(e.hire * clamp(rv.employees / 8000, 0.4, 2.2)));
    }
  }
  // 年収は効くが、青天井には効かない
  pop += clamp((pay - 11) * 1.6, -9, 11);
  return { pop: clamp(pop, 5, 120), pay, hire };
}

/**
 * 学生の応募者数。
 * 人気は効きかたが急で、名前が知られていない会社にはそもそも人が来ない。
 */
function applicantsOf(pop) {
  return Math.round(Math.pow(Math.max(1, pop) / 10, 2.6) * 6);
}

/**
 * 自社の行を作る。
 * 採用力（employerAppeal のスコア）は呼び出し側から渡す。
 * ここで recruit.js を読むと相互参照になるため。
 */
function selfRow(g, appealScore) {
  const rev = ttmRevenue(g);
  const hr = (g.staff || []).length;
  const pay = (g.recruit && g.recruit.ng && g.recruit.ng.salary) || 5.4;
  // 学生から見た当社。規模・ブランド・採用投資がそのまま知名度になる
  const pop = clamp(6 + (appealScore ?? 0.1) * 96 + Math.log10(Math.max(1, rev / 100)) * 5, 3, 120);
  const plan = (g.recruit && g.recruit.ng && g.recruit.ng.plan) || 0;
  return {
    id: 'player', name: g.company.name, ind: 'dev', isPlayer: true,
    pop, pay: (g.staff.length ? g.staff.reduce((a, s) => a + s.salary, 0) / g.staff.length : pay),
    hire: Math.max(1, plan || Math.max(1, Math.round(hr * 0.08))),
    hard: 1.0,
  };
}

/**
 * ランキングを組む。
 *  popRank  … 人気順（学生が行きたい順）
 *  hardRank … 入社難易度順（応募倍率。人気が高く採用数が少ないほど狭き門）
 */
export function jobRanking(g, appealScore) {
  const rows = EMPLOYERS.map(e => {
    const { pop, pay, hire } = popularityOf(g, e);
    return { ...e, pop, pay, hire };
  });
  rows.push(selfRow(g, appealScore));

  for (const r of rows) {
    r.applicants = applicantsOf(r.pop);
    // 何人採るかで狭き門かどうかが決まる。
    // 人気が同じでも、採用数が10倍違えば倍率はまるで違う
    r.ratio = r.applicants / Math.max(1, r.hire) * (r.hard || 1);
  }
  const byPop = rows.slice().sort((a, b) => b.pop - a.pop);
  byPop.forEach((r, i) => { r.popRank = i + 1; });
  const byHard = rows.slice().sort((a, b) => b.ratio - a.ratio);
  byHard.forEach((r, i) => { r.hardRank = i + 1; });
  return { rows, byPop, byHard, total: rows.length };
}

/** 自社の順位だけ取り出す */
export function selfRank(g, appealScore) {
  const { byPop, total } = jobRanking(g, appealScore);
  const me = byPop.find(r => r.isPlayer);
  return { pop: me.popRank, hard: me.hardRank, total, row: me };
}

/**
 * 同じ業界の他社がどれだけ学生を引っ張るか。
 * デベロッパーの人気が高いほど、内定を出しても他社に流れる。
 */
export function rivalPull(g, appealScore) {
  const { rows } = jobRanking(g, appealScore);
  const devs = rows.filter(r => r.ind === 'dev' && !r.isPlayer);
  const me = rows.find(r => r.isPlayer);
  if (!devs.length || !me) return 1;
  const avg = devs.reduce((a, r) => a + r.pop, 0) / devs.length;
  // 自社より人気のある会社が多いほど、引っ張られる
  return clamp(0.72 + (avg / Math.max(8, me.pop)) * 0.32, 0.72, 1.55);
}

/** 業界ごとの平均人気（どの業界が学生に人気かを見せる） */
export function byIndustry(g, appealScore) {
  const { rows } = jobRanking(g, appealScore);
  const acc = {};
  for (const r of rows) {
    const k = r.ind;
    acc[k] = acc[k] || { id: k, name: INDUSTRIES[k].name, short: INDUSTRIES[k].short, icon: INDUSTRIES[k].icon, n: 0, pop: 0, pay: 0, hire: 0 };
    acc[k].n++; acc[k].pop += r.pop; acc[k].pay += r.pay; acc[k].hire += r.hire;
  }
  return Object.values(acc).map(x => ({
    ...x, pop: x.pop / x.n, pay: x.pay / x.n,
  })).sort((a, b) => b.pop - a.pop);
}

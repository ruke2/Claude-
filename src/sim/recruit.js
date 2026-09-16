// ============================================================
//  採用 — 新卒の年次サイクルと中途の各チャネル
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { RNG } from '../core/rng.js';
import { uid, makeStaff, baseSalaryFor, avgAbility } from '../core/state.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, LAST_NAMES, FIRST_NAMES_CLEAN } from '../data/hrdata.js';
import { orgPower, payIndex } from './hr.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';

/** 新卒採用の年間スケジュール（週番号は年初からの通算） */
export const NG_SCHEDULE = {
  open: 9,        // 3月第1週  会社説明会・エントリー受付開始
  screen: 22,     // 6月第1週  選考開始（書類・面接）
  offer: 26,      // 7月第1週  内定出し
  ceremony: 39,   // 10月第1週 内定式（辞退が確定する）
  join: 13,       // 翌年4月第1週 入社
};

/** 出身校のランク */
export const SCHOOLS = [
  { id: 'S', name: '最難関大', w: 6, abil: [34, 52], pot: [78, 97], expect: 1.16, pick: 0.42 },
  { id: 'A', name: '難関大', w: 16, abil: [28, 47], pot: [68, 90], expect: 1.08, pick: 0.58 },
  { id: 'B', name: '中堅大', w: 34, abil: [24, 43], pot: [58, 82], expect: 1.00, pick: 0.74 },
  { id: 'C', name: '一般大', w: 44, abil: [20, 39], pot: [48, 74], expect: 0.94, pick: 0.86 },
];

/** 採用活動への投資メニュー（年間予算・百万円） */
export const RECRUIT_INVEST = [
  { id: 'seminar', name: '会社説明会・合同企業説明会', icon: '🎤', max: 600, desc: 'エントリー数が増える。母集団が厚いほど良い人材に当たる。' },
  { id: 'intern', name: 'インターンシップ', icon: '🧑‍💼', max: 800, desc: '学生の志望度が大きく上がり、能力の見極め精度も高まる。' },
  { id: 'ad', name: '採用広告・求人媒体', icon: '📣', max: 500, desc: 'エントリー数を底上げする。質への影響は限定的。' },
  { id: 'recruiter', name: 'リクルーター制度', icon: '🤝', max: 700, desc: '社員が個別に接触する。志望度と内定承諾率が上がる。' },
];

/** 中途採用のチャネル */
export const MID_CHANNELS = {
  agent: {
    id: 'agent', name: '人材エージェント', icon: '💼',
    desc: '紹介会社経由。年収の30%前後の成功報酬がかかるが、質の高い即戦力が集まる。',
    n: 4, abil: [52, 80], pot: [58, 88], age: [28, 46], loyalty: 0.52, feeRate: 0.30, refresh: 4,
  },
  open: {
    id: 'open', name: '自社サイト公募', icon: '🌐',
    desc: '費用はほぼかからないが、応募の質はばらつく。企業ブランドが低いと人が集まらない。',
    n: 5, abil: [38, 68], pot: [50, 80], age: [26, 44], loyalty: 0.58, feeRate: 0.04, refresh: 3,
  },
  referral: {
    id: 'referral', name: 'リファラル（社員紹介）', icon: '🔗',
    desc: '社員の紹介。定着率が高く費用も安いが、社員の士気が高くないと紹介が出てこない。',
    n: 2, abil: [46, 74], pot: [55, 85], age: [27, 45], loyalty: 0.78, feeRate: 0.08, refresh: 6,
  },
  headhunt: {
    id: 'headhunt', name: 'ヘッドハンティング', icon: '🎯',
    desc: '他社のエースを一本釣りする。極めて高コストで定着率も低いが、一人で事業が変わる。',
    n: 2, abil: [72, 95], pot: [76, 99], age: [34, 52], loyalty: 0.40, feeRate: 0.90, refresh: 10,
  },
};

const name = rng => rng.pick(LAST_NAMES) + ' ' + rng.pick(FIRST_NAMES_CLEAN);

/** 初期化 */
export function initRecruit(g) {
  return {
    ng: {
      phase: 'idle', year: g.year + 1, plan: 8, salary: 5.4,
      invest: { seminar: 120, intern: 0, ad: 80, recruiter: 0 },
      screenPolicy: 0.5,
      pool: [], offers: [], hired: 0, declined: 0, spent: 0,
      log: [],
    },
    mid: { pools: {}, refreshed: {} },
  };
}

// ------------------------------------------------------------
//  新卒
// ------------------------------------------------------------
/** 採用力（応募が集まるかどうか） */
export function employerAppeal(g) {
  const p = orgPower(g);
  const r = g.recruit.ng;
  const invest = (r.invest.seminar + r.invest.ad * 0.8 + r.invest.intern * 1.1 + r.invest.recruiter * 0.9);
  return {
    brand: g.company.brand,
    hr: p.hr.quality,
    pay: payIndex(g),
    invest,
    score: clamp01(
      0.16 + g.company.brand / 220 + p.hr.quality / 420
      + Math.sqrt(invest) / 70
      + (r.salary - 5.2) * 0.055
      + (g.hrPolicy.programs.brandpr ? 0.10 : 0)
      + (g.hrPolicy.programs.welfare ? 0.05 : 0)
    ),
  };
}

/** 候補者の推定能力（選考段階が進むほど誤差が縮む） */
export function estimate(c, stage, hrQuality) {
  const err = Math.max(2, (26 - stage * 7) * (1 - hrQuality / 260));
  return { lo: Math.max(0, Math.round(c.trueAbil - err)), hi: Math.min(99, Math.round(c.trueAbil + err)), err: Math.round(err) };
}

function makeGrad(g, rng, appeal) {
  const sc = rng.weighted(SCHOOLS.map(s => ({ ...s, w: s.w * (1 + (s.id === 'S' || s.id === 'A' ? appeal.score * 1.8 : 0)) })));
  const abil = {};
  const base = rng.range(sc.abil[0], sc.abil[1]);
  const spec = rng.pick(ABILITY_IDS);
  for (const k of ABILITY_IDS) abil[k] = Math.round(clamp(rng.normal(base * (k === spec ? 1.2 : 0.88), 7), 6, 92));
  const pot = Math.round(rng.range(sc.pot[0], sc.pot[1]));
  const trueAbil = ABILITY_IDS.reduce((a, k) => a + abil[k], 0) / ABILITY_IDS.length;
  return {
    id: uid('g'), name: name(rng), age: rng.int(22, 24),
    school: sc.id, schoolName: sc.name,
    abil, potential: pot, trueAbil,
    spec, dept: DEPTS[Object.keys(DEPTS).find(d => DEPTS[d].key === spec)] ? Object.keys(DEPTS).find(d => DEPTS[d].key === spec) : rng.pick(DEPT_IDS),
    interest: clamp01(rng.range(0.25, 0.62) + appeal.score * 0.45 + (g.recruit.ng.invest.intern > 200 ? 0.12 : 0)),
    rivalAppeal: clamp01(rng.range(0.35, 0.85) * sc.expect),
    stage: 0,           // 0=エントリー 1=書類通過 2=面接通過 3=内定
    status: 'entry',
    expected: Math.round((5.0 + (pot / 100) * 1.6) * 10) / 10,
  };
}

/** 週次処理 */
export function stepRecruit(g, rng, news) {
  if (!g.recruit) g.recruit = initRecruit(g);
  const r = g.recruit.ng;
  const woy = g.weekOfYear;
  const p = orgPower(g);
  const appeal = employerAppeal(g);

  // --- 3月：エントリー受付開始 ---
  if (woy === NG_SCHEDULE.open) {
    r.phase = 'attract';
    r.year = g.year + 1;
    r.pool = []; r.offers = []; r.declined = 0; r.spent = 0;
    const invest = r.invest.seminar + r.invest.ad + r.invest.intern + r.invest.recruiter;
    g.cash -= invest;
    g.finance.quarterAcc.sga += invest;
    r.spent += invest;
    const n = Math.round(clamp(r.plan * (1.6 + appeal.score * 5.2) * rng.range(0.85, 1.15), 0, 240));
    for (let i = 0; i < n; i++) r.pool.push(makeGrad(g, rng, appeal));
    news.push({
      icon: '🎓', type: 'hr', major: true,
      text: `${r.year}年度の新卒採用が始まった。エントリー${n}名（計画${r.plan}名）。採用活動費${Math.round(invest / 100).toLocaleString()}億円を投じた。`,
    });
    r.log.push({ week: g.week, text: `エントリー${n}名` });
  }

  // --- 3〜6月：志望度が動く ---
  if (r.phase === 'attract' && woy > NG_SCHEDULE.open && woy < NG_SCHEDULE.screen) {
    const push = (r.invest.recruiter / 700) * 0.006 + (r.invest.intern / 800) * 0.008;
    for (const c of r.pool) c.interest = clamp01(c.interest + push + rng.normal(0, 0.006));
  }

  // --- 6月：選考開始（書類選考） ---
  if (woy === NG_SCHEDULE.screen && r.phase === 'attract') {
    r.phase = 'screening';
    const acc = clamp01(0.45 + p.hr.quality / 300);
    for (const c of r.pool) {
      c.seen = c.trueAbil + rng.normal(0, (1 - acc) * 22);
      c.stage = 1;
    }
    // 見かけの評価順に、計画の6倍までを面接に進める
    r.pool.sort((a, b) => b.seen - a.seen);
    const keep = Math.min(r.pool.length, Math.max(r.plan * 6, 12));
    for (let i = 0; i < r.pool.length; i++) r.pool[i].status = i < keep ? 'interview' : 'rejected';
    news.push({ icon: '📝', type: 'hr', major: true, text: `新卒選考を開始した。書類選考を通過したのは${keep}名である。` });
  }

  // --- 6〜7月：面接が進み、能力の見立てが精緻になる ---
  if (r.phase === 'screening' && woy > NG_SCHEDULE.screen && woy < NG_SCHEDULE.offer) {
    const acc = clamp01(0.55 + p.hr.quality / 240 + (r.invest.intern > 300 ? 0.12 : 0));
    for (const c of r.pool) {
      if (c.status !== 'interview') continue;
      c.stage = 2;
      c.seen = c.trueAbil + rng.normal(0, (1 - acc) * 14);
      c.interest = clamp01(c.interest + (r.invest.recruiter / 700) * 0.01);
    }
  }

  // --- 7月：内定出しフェーズへ ---
  if (woy === NG_SCHEDULE.offer && r.phase === 'screening') {
    r.phase = 'offer';
    news.push({
      icon: '📨', type: 'hr', major: true,
      text: `内定出しの時期になった。人事タブから内定を出す学生を選ぶこと（面接通過 ${r.pool.filter(c => c.status === 'interview').length}名）。`,
    });
  }

  // --- 7〜10月：他社の動き。放置すると持っていかれる ---
  if (r.phase === 'offer' && woy > NG_SCHEDULE.offer && woy < NG_SCHEDULE.ceremony) {
    for (const c of r.pool) {
      if (c.status === 'interview' && rng.chance(c.rivalAppeal * 0.035)) {
        c.status = 'lost';
        c.lostTo = rng.pick(g.rivals).name;
      }
      if (c.status === 'offered' && rng.chance(c.rivalAppeal * 0.02 * (1 - c.interest))) {
        c.rivalOffer = true;
      }
    }
  }

  // --- 10月：内定式。辞退が確定する ---
  if (woy === NG_SCHEDULE.ceremony && r.phase === 'offer') {
    r.phase = 'waiting';
    let ok = 0, ng = 0;
    for (const c of r.offers.slice()) {
      const hold = clamp01(c.interest * 0.85 + (r.salary - c.expected) * 0.18 + (c.followed ? 0.18 : 0) + (r.invest.recruiter / 700) * 0.1);
      if (rng.chance(hold)) { c.status = 'accepted'; ok++; }
      else {
        c.status = 'declined'; ng++;
        r.offers.splice(r.offers.indexOf(c), 1);
        r.declined++;
      }
    }
    news.push({
      icon: '🎊', type: 'hr', major: true,
      text: `${r.year}年度の内定式を行った。承諾${ok}名／辞退${ng}名（計画${r.plan}名に対し充足率 ${Math.round(ok / Math.max(1, r.plan) * 100)}%）。`,
    });
    r.log.push({ week: g.week, text: `内定承諾${ok}名・辞退${ng}名` });
  }

  // --- 4月：入社 ---
  if (woy === NG_SCHEDULE.join && r.phase === 'waiting') {
    let n = 0;
    for (const c of r.offers) {
      if (c.status !== 'accepted') continue;
      const s = makeStaff(rng, { dept: c.dept, rank: 0, age: c.age, loyalty: 0.74, channel: 'newgrad' });
      s.name = c.name;
      s.abil = { ...c.abil };
      s.potential = c.potential;
      s.tenure = 0;
      s.joined = { year: g.year, week: g.week };
      s.school = c.school;
      s.salary = Math.round(r.salary * 10) / 10;
      s.morale = clamp01(0.72 + c.interest * 0.22);
      g.staff.push(s);
      n++;
    }
    r.hired = n;
    r.offers = []; r.pool = []; r.phase = 'idle';
    if (n) news.push({ icon: '🌸', type: 'hr', major: true, text: `${g.year}年度の新入社員${n}名が入社した。` });
    else news.push({ icon: '⚠', type: 'hr', major: true, text: `今年度の新卒入社はゼロだった。採用活動への投資と初任給を見直すこと。` });
  }

  // --- 中途：候補者プールの更新 ---
  const mid = g.recruit.mid;
  for (const ch of Object.values(MID_CHANNELS)) {
    const last = mid.refreshed[ch.id] ?? -99;
    if (g.week - last < ch.refresh) continue;
    mid.refreshed[ch.id] = g.week;
    mid.pools[ch.id] = generateMidPool(g, rng, ch.id);
  }
}

/** 中途候補者を生成 */
export function generateMidPool(g, rng, channelId) {
  const ch = MID_CHANNELS[channelId];
  const p = orgPower(g);
  const appeal = clamp01(0.2 + g.company.brand / 170 + p.hr.quality / 320 + (payIndex(g) - 1) * 0.5);
  let n = ch.n;
  if (channelId === 'referral') {
    // 社員の士気が高いほど紹介が出る
    const mor = g.staff.length ? g.staff.reduce((a, s) => a + s.morale, 0) / g.staff.length : 0.5;
    n = Math.round(clamp(g.staff.length / 22 * (mor - 0.45) * 3, 0, 4));
  }
  if (channelId === 'open') n = Math.round(clamp(ch.n * (0.4 + appeal * 1.5), 1, 9));
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = clamp01(appeal + rng.normal(0, 0.2));
    const s = makeStaff(rng, {
      ageRange: ch.age,
      abilityRange: [ch.abil[0] + q * 8, Math.min(97, ch.abil[1] * (0.86 + q * 0.2))],
      potentialRange: ch.pot,
      loyalty: ch.loyalty, channel: channelId,
      dept: rng.pick(DEPT_IDS),
    });
    s.rank = clamp(Math.floor((avgAbility(s) - 42) / 11), 0, 5);
    s.salary = Math.round(baseSalaryFor(s) * (channelId === 'headhunt' ? 1.45 : channelId === 'agent' ? 1.14 : 1.04) * 10) / 10;
    s.hireCost = Math.round(s.salary * ch.feeRate * 10) / 10;
    s.prevCompany = channelId === 'referral'
      ? `${rng.pick(g.staff.length ? g.staff : [{ name: '社員' }]).name}の紹介`
      : rng.pick(g.rivals).name;
    s.channelId = channelId;
    s.available = 3 + rng.int(0, 4);      // 何週で他社に決まるか
    out.push(s);
  }
  return out.sort((a, b) => avgAbility(b) - avgAbility(a));
}

/** 内定を出す */
export function makeOffer(g, c) {
  const r = g.recruit.ng;
  if (c.status !== 'interview') return false;
  c.status = 'offered'; c.stage = 3;
  r.offers.push(c);
  return true;
}
export function withdrawOffer(g, c) {
  const r = g.recruit.ng;
  const i = r.offers.indexOf(c);
  if (i >= 0) r.offers.splice(i, 1);
  c.status = 'interview'; c.stage = 2;
}

/** 内定者フォロー（懇親会・面談）で志望度を上げる */
export function followUp(g, c) {
  const cost = 2.4;
  if (g.cash < cost) return false;
  g.cash -= cost;
  g.finance.quarterAcc.sga += cost;
  g.recruit.ng.spent += cost;
  c.followed = true;
  c.interest = clamp01(c.interest + 0.16);
  return true;
}

// ============================================================
//  採用 — 新卒の年次サイクルと中途の各チャネル
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { RNG } from '../core/rng.js';
import { uid, makeStaff, baseSalaryFor, avgAbility } from '../core/state.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, LAST_NAMES, FIRST_NAMES_CLEAN } from '../data/hrdata.js';
import { orgPower, payIndex } from './hr.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';
import { cultureEffects, cultureMatch, randomPreference } from './culture.js';
import { ttm } from './finance.js';
import { rivalPull } from './jobrank.js';

/** 新卒採用の年間スケジュール（週番号は年初からの通算） */
export const NG_SCHEDULE = {
  open: 9,        // 3月第1週  会社説明会・エントリー受付開始
  screen: 22,     // 6月第1週  選考開始（書類・面接）
  offer: 26,      // 7月第1週  内定出し
  ceremony: 39,   // 10月第1週 内定式（辞退が確定する）
  join: 13,       // 翌年4月第1週 入社
};

/** 大学（すべて架空）。tier が高いほど地力と潜在能力に優れる */
/**
 * 出身大学。実在の大学をもじった架空の校名で、実在の大学とは関係がない。
 * tier が素質の分布を、w が母集団での多さを決める。
 */
export const UNIVERSITIES = [
  // --- S：最難関 ---
  { id: 'toutei',   name: '東帝大学',         short: '東帝大',     tier: 'S', w: 1.6 },
  { id: 'kyoraku',  name: '京洛大学',         short: '京洛大',     tier: 'S', w: 1.3 },
  { id: 'tomon',    name: '稲門大学',         short: '稲門大',     tier: 'S', w: 2.2 },
  { id: 'mita',     name: '三田義塾大学',     short: '三田義塾',   tier: 'S', w: 2.0 },
  { id: 'josui',    name: '如水大学',         short: '如水大',     tier: 'S', w: 1.0 },
  { id: 'ookayama', name: '大岡山工科大学',   short: '大岡山工大', tier: 'S', w: 1.1 },
  // --- A：難関 ---
  { id: 'naniwa',   name: '浪華大学',         short: '浪華大',     tier: 'A', w: 2.2 },
  { id: 'morito',   name: '杜都大学',         short: '杜都大',     tier: 'A', w: 2.0 },
  { id: 'owari',    name: '尾張大学',         short: '尾張大',     tier: 'A', w: 2.0 },
  { id: 'rokko',    name: '六甲大学',         short: '六甲大',     tier: 'A', w: 1.9 },
  { id: 'meiou',    name: '明應大学',         short: '明應大',     tier: 'A', w: 4.4 },
  { id: 'seinan',   name: '青南学院大学',     short: '青南学院',   tier: 'A', w: 3.8 },
  { id: 'chuou',    name: '中桜大学',         short: '中桜大',     tier: 'A', w: 3.6 },
  // --- B：中堅 ---
  { id: 'hosho',    name: '法承大学',         short: '法承大',     tier: 'B', w: 5.4 },
  { id: 'ikebukuro', name: '池袋学院大学',    short: '池袋学院',   tier: 'B', w: 4.8 },
  { id: 'kinugasa', name: '衣笠館大学',       short: '衣笠館大',   tier: 'B', w: 4.6 },
  { id: 'kansaig',  name: '関西学舎大学',     short: '関西学舎',   tier: 'B', w: 4.2 },
  { id: 'nitto',    name: '日東大学',         short: '日東大',     tier: 'B', w: 7.0 },
  { id: 'shibahama', name: '芝浜工業大学',    short: '芝浜工大',   tier: 'B', w: 3.8 },
  { id: 'toyo',     name: '東洋文華大学',     short: '東洋文華',   tier: 'B', w: 5.0 },
  // --- C：一般 ---
  { id: 'teito',    name: '帝都大学',         short: '帝都大',     tier: 'C', w: 7.4 },
  { id: 'daitobun', name: '大東文成大学',     short: '大東文成',   tier: 'C', w: 7.0 },
  { id: 'kokushi',  name: '国士洛大学',       short: '国士洛大',   tier: 'C', w: 6.6 },
  { id: 'johoku',   name: '城北商科大学',     short: '城北商科',   tier: 'C', w: 6.2 },
  { id: 'tokaiyo',  name: '東海洋大学',       short: '東海洋大',   tier: 'C', w: 7.2 },
  { id: 'midori',   name: '緑川学院大学',     short: '緑川学院',   tier: 'C', w: 5.8 },
];

/** 大学の格ごとの素質 */
export const TIERS = {
  S: { id: 'S', label: '最難関', abil: [34, 52], pot: [78, 97], expect: 1.16, rivalPull: 0.88 },
  A: { id: 'A', label: '難関',   abil: [28, 47], pot: [68, 90], expect: 1.08, rivalPull: 0.72 },
  B: { id: 'B', label: '中堅',   abil: [24, 43], pot: [58, 82], expect: 1.00, rivalPull: 0.54 },
  C: { id: 'C', label: '一般',   abil: [20, 39], pot: [48, 74], expect: 0.94, rivalPull: 0.38 },
};

/** 学部。伸びやすい能力が変わる */
export const FACULTIES = [
  { id: 'arch',  name: '建築学科',     key: 'plan',  w: 12, note: '意匠設計と商品企画に強い' },
  { id: 'civil', name: '土木工学科',   key: 'cons',  w: 9,  note: '施工管理と工程管理に強い' },
  { id: 'urban', name: '都市工学科',   key: 'plan',  w: 7,  note: '再開発と都市計画に強い' },
  { id: 'law',   name: '法学部',       key: 'land',  w: 13, note: '権利調整と地権者交渉に強い' },
  { id: 'econ',  name: '経済学部',     key: 'fin',   w: 15, note: '投資判断と資金調達に強い' },
  { id: 'comm',  name: '商学部',       key: 'fin',   w: 11, note: '会計と与信管理に強い' },
  { id: 'mgmt',  name: '経営学部',     key: 'lead',  w: 10, note: '組織運営と事業管理に強い' },
  { id: 'soc',   name: '社会学部',     key: 'sales', w: 10, note: '市場調査と販売に強い' },
  { id: 'lit',   name: '文学部',       key: 'sales', w: 8,  note: '対人折衝と広報に強い' },
  { id: 'sci',   name: '理工学部',     key: 'cons',  w: 8,  note: '構造と設備の知識に強い' },
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
      deptPlan: { land: 2, plan: 1, cons: 1, sales: 2, lease: 1, fin: 1, hr: 0, corp: 0 },
      pool: [], offers: [], incoming: [], hired: 0, declined: 0, spent: 0,
      log: [],
    },
    mid: { pools: {}, refreshed: {} },
  };
}

// ------------------------------------------------------------
//  新卒
// ------------------------------------------------------------
/** 採用力（応募が集まるかどうか）。内訳も返す */
export function employerAppeal(g) {
  const p = orgPower(g);
  const r = g.recruit.ng;
  const ce = cultureEffects(g);
  const invest = (r.invest.seminar + r.invest.ad * 0.8 + r.invest.intern * 1.1 + r.invest.recruiter * 0.9);
  const t = ttm(g);

  // 企業規模による知名度。売上が伸びれば学生に名前が届くようになる
  const revScore = clamp01(Math.log10(Math.max(1, t.revenue / 50)) / 2.6);
  const sizeScore = clamp01(Math.log10(Math.max(1, g.staff.length / 18)) / 1.8);
  const parts = {
    base: 0.08,
    scale: revScore * 0.26,
    size: sizeScore * 0.13,
    brand: g.company.brand / 340,
    listed: g.company.listed ? 0.07 : 0,
    hr: p.hr.quality / 560,
    invest: Math.sqrt(invest) / 135,
    salary: (r.salary - 5.2) * 0.05,
    programs: (g.hrPolicy.programs.brandpr ? 0.09 : 0) + (g.hrPolicy.programs.welfare ? 0.04 : 0),
    culture: ce.appealShift,
  };
  const score = clamp01(Object.values(parts).reduce((a, b) => a + b, 0));
  return {
    brand: g.company.brand, hr: p.hr.quality, pay: payIndex(g), invest,
    revenue: t.revenue, parts, score,
  };
}

/** 候補者の推定能力（選考段階が進むほど誤差が縮む） */
export function estimate(c, stage, hrQuality) {
  const err = Math.max(2, (26 - stage * 7) * (1 - hrQuality / 260));
  return { lo: Math.max(0, Math.round(c.trueAbil - err)), hi: Math.min(99, Math.round(c.trueAbil + err)), err: Math.round(err) };
}

function makeGrad(g, rng, appeal) {
  // 採用力が高いほど上位校の学生が集まる
  const uni = rng.weighted(UNIVERSITIES.map(u => ({
    ...u, w: u.w * (1 + ((u.tier === 'S' || u.tier === 'A') ? appeal.score * 2.0 : 0)),
  })));
  const T = TIERS[uni.tier];
  const fac = rng.weighted(FACULTIES);
  const abil = {};
  const base = rng.range(T.abil[0], T.abil[1]);
  const spec = fac.key;
  for (const k of ABILITY_IDS) abil[k] = Math.round(clamp(rng.normal(base * (k === spec ? 1.26 : 0.88), 7), 6, 92));
  const pot = Math.round(rng.range(T.pot[0], T.pot[1]));
  const trueAbil = ABILITY_IDS.reduce((a, k) => a + abil[k], 0) / ABILITY_IDS.length;
  const fitDept = DEPT_IDS.filter(d => DEPTS[d].key === spec);
  const pref = randomPreference(rng);
  const cultureFit = cultureMatch(g, pref);
  return {
    id: uid('g'), name: name(rng), age: rng.int(22, 24),
    uni: uni.id, uniName: uni.name, uniShort: uni.short, tier: uni.tier,
    faculty: fac.id, facultyName: fac.name, facultyNote: fac.note,
    abil, potential: pot, trueAbil, spec,
    dept: fitDept.length ? rng.pick(fitDept) : rng.pick(DEPT_IDS),
    wishDept: fitDept.length ? rng.pick(fitDept) : rng.pick(DEPT_IDS),
    pref, cultureFit,
    interest: clamp01(rng.range(0.22, 0.56) + appeal.score * 0.42
      + (g.recruit.ng.invest.intern > 200 ? 0.10 : 0) + (cultureFit - 0.5) * 0.34),
    // 他社に引っ張られやすさ。就職人気ランキングで当社より上の会社が多いほど強くなる
    rivalAppeal: clamp01(rng.range(0.4, 0.95) * T.rivalPull * rivalPull(g, appeal.score)),
    stage: 0,
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
    // 前年度に内定を承諾した学生は入社待ちとして持ち越す
    r.incoming = (r.incoming || []).concat(r.offers.filter(c => c.status === 'accepted'));
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
      const hold = clamp01(c.interest * 0.82 + (r.salary - c.expected) * 0.18 + (c.followed ? 0.18 : 0)
        + (r.invest.recruiter / 700) * 0.1 + ((c.cultureFit ?? 0.5) - 0.5) * 0.22);
      if (rng.chance(hold)) { c.status = 'accepted'; ok++; }
      else {
        c.status = 'declined'; ng++;
        r.offers.splice(r.offers.indexOf(c), 1);
        r.declined++;
      }
    }
    news.push({
      icon: '🎊', type: 'hr', major: true,
      text: `${r.year}年度の内定式を行った。承諾${ok}名／辞退${ng}名（計画${r.plan}名に対し充足率 ${Math.round(ok / Math.max(1, r.plan) * 100)}%）。来年4月に入社する。`,
    });
    r.log.push({ week: g.week, text: `内定承諾${ok}名・辞退${ng}名` });
  }

  // --- 4月：入社（配属枠に従って各部署へ） ---
  if (woy === NG_SCHEDULE.join) {
    const list = (r.incoming || []).concat(r.phase === 'waiting' ? r.offers.filter(c => c.status === 'accepted') : []);
    if (r.phase === 'waiting') { r.offers = []; r.pool = []; r.phase = 'idle'; }
    r.incoming = [];
    if (list.length) {
      const slots = allocateQuota(r.deptPlan, list.length);
      const placed = {};
      list.sort((a, b) => b.trueAbil - a.trueAbil);
      for (const c of list) {
        const order = DEPT_IDS.slice().sort((x, y) => (c.abil[DEPTS[y].key] - c.abil[DEPTS[x].key]));
        let dept = order.find(d => (slots[d] || 0) > 0);
        if (!dept) dept = c.wishDept || order[0];
        else slots[dept]--;
        const s = makeStaff(rng, { dept, rank: 0, age: c.age, loyalty: 0.74, channel: 'newgrad' });
        s.name = c.name;
        s.abil = { ...c.abil };
        s.potential = c.potential;
        s.tenure = 0;
        s.joined = { year: g.year, week: g.week };
        s.uni = c.uni; s.uniName = c.uniName; s.uniShort = c.uniShort;
        s.faculty = c.faculty; s.facultyName = c.facultyName;
        s.salary = Math.round(r.salary * 10) / 10;
        s.morale = clamp01(0.72 + c.interest * 0.22) * (dept === c.wishDept ? 1 : 0.92);
        g.staff.push(s);
        placed[dept] = (placed[dept] || 0) + 1;
      }
      r.hired = list.length;
      const detail = Object.entries(placed).map(([d, n]) => `${DEPTS[d].short}${n}`).join('・');
      news.push({ icon: '🌸', type: 'hr', major: true, text: `${g.year}年度の新入社員${list.length}名が入社した（配属：${detail}）。` });
    } else if (r.phase === 'idle') {
      r.hired = 0;
      news.push({ icon: '⚠', type: 'hr', major: true, text: `今年度の新卒入社はゼロだった。採用活動への投資と初任給、内定出しの人数を見直すこと。` });
    }
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

/**
 * 受入希望人数の比率で実際の配属数を按分する。
 * 入社数が計画より少なくても多くても、希望比率を保ったまま四捨五入して割り振る。
 */
export function allocateQuota(deptPlan, n) {
  const plan = deptPlan || {};
  const total = DEPT_IDS.reduce((a, d) => a + (plan[d] || 0), 0);
  const quota = {};
  if (!total || !n) { for (const d of DEPT_IDS) quota[d] = 0; return quota; }
  const raw = {};
  let assigned = 0;
  for (const d of DEPT_IDS) {
    raw[d] = (plan[d] || 0) / total * n;
    quota[d] = Math.round(raw[d]);
    assigned += quota[d];
  }
  // 四捨五入の誤差を、端数の大きい（小さい）部署から調整する
  let diff = n - assigned;
  const order = DEPT_IDS.filter(d => (plan[d] || 0) > 0)
    .sort((a, b) => (raw[b] - quota[b]) - (raw[a] - quota[a]));
  let i = 0, guard = 0;
  while (diff !== 0 && order.length && guard++ < 999) {
    const d = diff > 0 ? order[i % order.length] : order[order.length - 1 - (i % order.length)];
    if (diff > 0) { quota[d]++; diff--; }
    else if (quota[d] > 0) { quota[d]--; diff++; }
    i++;
  }
  return quota;
}

/** 配属の予定表（UI表示用） */
export function plannedAllocation(g, n) {
  return allocateQuota(g.recruit.ng.deptPlan, n);
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
    s.pref = randomPreference(rng);
    s.cultureFit = cultureMatch(g, s.pref);
    s.loyalty = clamp01(s.loyalty + (s.cultureFit - 0.5) * 0.3);
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

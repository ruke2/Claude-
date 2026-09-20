// ============================================================
//  定時株主総会
//    上場していれば年に1回（6月）開く。
//    会社側の議案と、機関投資家・アクティビストからの株主提案がかかり、
//    賛成率で可決・否決が決まる。
//
//    賛成率を決めるのは「経営の成績」である。
//    ROE・株価の推移・配当・中計の達成・IRの信頼度。
//    **議案ごとの好き嫌いだけで決めないこと。**
//    成績が悪ければ会社提案でも危うくなるのが総会である。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { WEEKS_PER_QUARTER } from '../core/time.js';
import { sharePrice, marketCap, buildBS, ttm } from './finance.js';
import { irPremium } from './ir.js';
import { planProgress } from './midplan.js';

/** 総会を開く週（6月の第2週あたり） */
export const MEETING_WEEK = 24;

/** 株主の顔ぶれ。合計は 1.00 にする */
export const HOLDERS = [
  { id: 'founder', name: '創業家・経営陣', base: 0.18, loyalty: 0.95 },
  { id: 'bank', name: '取引金融機関', base: 0.14, loyalty: 0.80 },
  { id: 'trust', name: '信託銀行（年金）', base: 0.22, loyalty: 0.45 },
  { id: 'foreign', name: '海外機関投資家', base: 0.26, loyalty: 0.22 },
  { id: 'retail', name: '個人株主', base: 0.14, loyalty: 0.55 },
  { id: 'activist', name: '物言う株主', base: 0.06, loyalty: 0.02 },
];

/**
 * 経営の成績（-1〜+1）。賛成率の土台になる。
 * **ここで kpis() を呼ばないこと。** ir.js と同じで一周して再帰する。
 */
export function scoreOf(g) {
  const bs = g.finance.bs || buildBS(g);
  const t = ttm(g);
  const eq = Math.max(1, bs.equity);
  const roe = t.net / eq;                                  // 年換算の自己資本利益率
  const hist = g.history || [];
  const prices = hist.map(h => h.price).filter(v => v > 0);
  const priceUp = prices.length >= 5
    ? prices[prices.length - 1] / Math.max(1, prices[prices.length - 5]) - 1 : 0;
  const div = (g.company.payout ?? 0.22);
  const plan = g.midPlan && g.midPlan.status === 'active' ? planProgress(g, g.midPlan) : null;
  const ir = clamp((g.company.irTrust || 0) / 3, -0.3, 0.3);

  const parts = {
    roe: clamp((roe - 0.06) / 0.10, -1, 1) * 0.34,
    price: clamp(priceUp / 0.30, -1, 1) * 0.24,
    payout: clamp((div - 0.20) / 0.20, -1, 1) * 0.14,
    plan: plan != null ? clamp((plan - 0.5) / 0.4, -1, 1) * 0.16 : 0,
    ir: ir * 0.12,
  };
  const total = Object.values(parts).reduce((a, v) => a + v, 0);
  return { total: clamp(total, -1, 1), parts, roe, priceUp, div };
}

/** 株主構成。総会をくり返すと、成績次第で物言う株主の比率が動く */
export function holdersOf(g) {
  const act = clamp(g.company.activistShare ?? 0.06, 0.02, 0.28);
  const rest = 1 - act;
  const others = HOLDERS.filter(h => h.id !== 'activist');
  const sum = others.reduce((a, h) => a + h.base, 0);
  return HOLDERS.map(h => h.id === 'activist'
    ? { ...h, share: act }
    : { ...h, share: h.base / sum * rest });
}

// ------------------------------------------------------------
//  議案
// ------------------------------------------------------------
/**
 * 会社提案。プレイヤーが選んでかける。
 * `need` は可決に必要な賛成率（普通決議 0.5／特別決議 2/3）。
 */
export const COMPANY_ITEMS = [
  {
    id: 'dividend', name: '剰余金の処分（増配）', need: 0.5, appeal: 0.30,
    desc: '配当性向を5ポイント引き上げる。株主の受けは良いが、手元資金は減る。',
    can: g => (g.company.payout ?? 0.22) < 0.6,
    apply: (g) => { g.company.payout = Math.min(0.6, (g.company.payout ?? 0.22) + 0.05); },
    ok: '増配が承認された。', ng: '増配案は否決された。',
  },
  {
    id: 'buyback', name: '自己株式の取得', need: 0.5, appeal: 0.34,
    desc: '発行済株式の3%を買い戻す。1株あたりの価値が上がるが、現金を使う。',
    can: g => g.cash > marketCap(g) * 0.05,
    apply: (g) => {
      const n = Math.round(g.company.shares * 0.03);
      const cost = Math.round(sharePrice(g) * n / 1e6);
      g.cash -= cost;
      g.company.shares -= n;
      g.company.buyback = (g.company.buyback || 0) + cost;
    },
    ok: '自己株式の取得が承認された。', ng: '自己株式の取得は否決された。',
  },
  {
    id: 'officers', name: '取締役選任の件', need: 0.5, appeal: 0.05,
    desc: 'いま任命している役員の再任を諮る。否決されると役員が解任される。',
    can: () => true,
    apply: () => {},
    fail: (g, news) => {
      // 否決されたら、いちばん能力の低い役員が退任する
      const offs = (g.staff || []).filter(s => s.oversee);
      if (!offs.length) return;
      offs.sort((a, b) => (a.abil ? avg(a.abil) : 0) - (b.abil ? avg(b.abil) : 0));
      const s = offs[0];
      s.oversee = null; s.rank = Math.max(0, s.rank - 1);
      news && news.push({ icon: '⚖', type: 'hr', major: true, text: `${s.name}の取締役再任が否決され、退任した。` });
    },
    ok: '取締役の選任が承認された。', ng: '取締役選任の一部が否決された。',
  },
  {
    id: 'articles', name: '定款一部変更（事業目的の追加）', need: 0.667, appeal: 0.10,
    desc: '事業目的を広げ、新しい領域に踏み出す構えを示す。特別決議（3分の2）が要る。',
    can: () => true,
    apply: (g) => { g.company.brand = Math.min(100, g.company.brand + 1.4); },
    ok: '定款変更が承認された。', ng: '定款変更は3分の2に届かず否決された。',
  },
  {
    id: 'stockopt', name: '役員報酬（株式報酬の導入）', need: 0.5, appeal: 0.12,
    desc: '役員報酬に株式報酬を入れる。経営陣の士気は上がるが、希薄化を嫌う株主もいる。',
    can: g => !g.company.stockOption,
    apply: (g) => {
      g.company.stockOption = true;
      for (const s of g.staff || []) if (s.oversee) s.morale = clamp01(s.morale + 0.12);
    },
    ok: '株式報酬の導入が承認された。', ng: '株式報酬の導入は否決された。',
  },
];

const avg = (o) => { let n = 0, s = 0; for (const k in o) { s += o[k]; n++; } return n ? s / n : 0; };

/**
 * 株主提案。成績が悪いほど出てくる。
 * 可決されると、こちらの意に反して実行される。
 */
export const SHAREHOLDER_ITEMS = [
  {
    id: 'bigDiv', name: '【株主提案】配当性向50%への引き上げ', need: 0.5, appeal: 0.42,
    when: g => (g.company.payout ?? 0.22) < 0.42,
    desc: '内部留保が厚すぎるとして、配当性向を50%まで引き上げるよう求めている。',
    apply: (g) => { g.company.payout = 0.5; },
    text: '配当性向50%への引き上げが可決された。以後、利益の半分を配当に回すことになる。',
  },
  {
    id: 'sellAssets', name: '【株主提案】保有不動産の一部売却', need: 0.5, appeal: 0.36,
    when: g => (g.assets || []).length >= 8,
    desc: '低利回りの保有物件を売却し、資本効率を高めるよう求めている。',
    apply: (g, news) => {
      const low = (g.assets || []).slice().sort((a, b) =>
        (a.noi / Math.max(1, a.bookLand + a.bookBuild)) - (b.noi / Math.max(1, b.bookLand + b.bookBuild)));
      g.company.forcedSale = low.slice(0, 2).map(a => a.id);
      news && news.push({ icon: '⚖', type: 'asset', text: '低利回りの2物件について、売却の検討を迫られている。' });
    },
    text: '保有不動産の一部売却が可決された。',
  },
  {
    id: 'outside', name: '【株主提案】社外取締役の選任', need: 0.5, appeal: 0.30,
    when: g => true,
    desc: '取締役会の監督機能が弱いとして、独立した社外取締役を選任するよう求めている。',
    apply: (g) => {
      g.company.outsideDirectors = (g.company.outsideDirectors || 0) + 1;
      g.company.brand = Math.min(100, g.company.brand + 0.8);
    },
    text: '社外取締役の選任が可決された。取締役会の監督は強まるが、経営の自由度は下がる。',
  },
  {
    id: 'ceoOut', name: '【株主提案】代表取締役の解任', need: 0.5, appeal: 0.16,
    when: g => (g.company.mtgLoss || 0) >= 2,
    desc: '長期にわたる株主価値の毀損を理由に、代表取締役の解任を求めている。',
    apply: (g) => {
      g.gameOver = {
        type: 'ousted', title: '解任',
        text: '株主総会で代表取締役の解任が可決された。あなたは会社を去ることになった。',
      };
    },
    text: '代表取締役の解任が可決された。',
  },
];

/** その年の総会で扱う議案を組む */
export function agendaOf(g) {
  const sc = scoreOf(g);
  const company = COMPANY_ITEMS.filter(it => !it.can || it.can(g));
  // 株主提案は成績が悪いほど出る
  const heat = clamp01(0.20 - sc.total * 0.55 + (g.company.activistShare ?? 0.06) * 1.6);
  const props = SHAREHOLDER_ITEMS.filter(it => it.when(g));
  return { score: sc, company, heat, proposals: props };
}

/**
 * 賛成率。
 * 株主ごとに「経営への信任 × 議案の魅力」で賛否が決まる。
 */
export function supportFor(g, item, isProposal) {
  const sc = scoreOf(g);
  let yes = 0;
  for (const h of holdersOf(g)) {
    // 忠誠の高い株主は成績が悪くても会社側に付く
    const trust = clamp01(0.5 + sc.total * (1 - h.loyalty) * 1.15 + (h.loyalty - 0.5) * 0.9);
    const base = isProposal ? (1 - trust) : trust;
    const v = clamp01(base + (item.appeal || 0) * (isProposal ? 1 : 0.8) - 0.06);
    yes += h.share * v;
  }
  return clamp01(yes);
}

/** 総会を開く。選んだ会社提案の配列を受け取る */
export function holdMeeting(g, picked, rng, news) {
  const ag = agendaOf(g);
  const results = [];
  for (const it of ag.company) {
    if (!picked.includes(it.id)) continue;
    const yes = supportFor(g, it, false);
    const pass = yes >= it.need;
    if (pass) it.apply(g, news); else it.fail && it.fail(g, news);
    results.push({ id: it.id, name: it.name, yes, need: it.need, pass, kind: 'company' });
    news.push({
      icon: pass ? '✅' : '⚠', type: 'ir', major: !pass,
      text: `【株主総会】${it.name}　賛成${(yes * 100).toFixed(1)}%　${pass ? it.ok : it.ng}`,
    });
  }
  // 株主提案。出るかどうかは heat で決まる
  for (const it of ag.proposals) {
    // **Math.random を使わないこと。** 乱数はシード付きに統一してある
    if (!rng.chance(ag.heat * 0.55)) continue;
    const yes = supportFor(g, it, true);
    const pass = yes >= it.need;
    if (pass) it.apply(g, news);
    results.push({ id: it.id, name: it.name, yes, need: it.need, pass, kind: 'proposal' });
    news.push({
      icon: pass ? '⚖' : '🛡', type: 'ir', major: true,
      text: `【株主総会】${it.name}　賛成${(yes * 100).toFixed(1)}%　${pass ? it.text : '否決された。'}`,
    });
  }

  // 成績が悪い年が続くと、物言う株主が買い増してくる
  const sc = ag.score;
  if (sc.total < -0.15) {
    g.company.mtgLoss = (g.company.mtgLoss || 0) + 1;
    g.company.activistShare = clamp((g.company.activistShare ?? 0.06) + 0.022, 0.02, 0.28);
  } else {
    g.company.mtgLoss = 0;
    g.company.activistShare = clamp((g.company.activistShare ?? 0.06) - 0.012, 0.02, 0.28);
  }
  g.company.lastMeeting = { year: g.year, score: sc.total, results };
  (g.meetings = g.meetings || []).push({ year: g.year, score: sc.total, results });
  if (g.meetings.length > 40) g.meetings.shift();
  return { score: sc, results };
}

/**
 * 総会を開ける状態か。
 * 週の判定は agenda.js が持つ（まとめて進めても飛ばないように）。
 * ここは「上場していて、今年まだ開いていない」だけを見る。
 */
export function meetingDue(g) {
  if (!g.company.listed) return false;
  return !(g.meetings || []).some(m => m.year === g.year);
}

export { WEEKS_PER_QUARTER };

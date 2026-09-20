// ============================================================
//  子会社・M&A — 設立／買収／PMI／のれん／失敗
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { uid } from '../core/state.js';
import { SUB_TYPES, TARGET_TEMPLATES } from '../data/companies.js';
import { orgPower } from './hr.js';
import { DEPTS } from '../data/hrdata.js';
import { WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from '../core/time.js';

/** リスクが顕在化しうる期間（買収後3年） */
const RISK_WINDOW = 156;

/** 買収先に潜むリスク */
export const MA_RISKS = [
  { id: 'debt',     name: '簿外債務',           p: 0.16, sev: 0.9, desc: '決算書に現れない債務。買収後に特別損失として表面化する。' },
  { id: 'window',   name: '会計処理の不適切さ', p: 0.12, sev: 0.8, desc: '売上の前倒し計上など。修正により利益が大幅に減る。' },
  { id: 'keyman',   name: 'キーマン依存',       p: 0.22, sev: 0.6, desc: '主要人材が買収を機に退職すると、シナジーの大半が失われる。' },
  { id: 'culture',  name: '企業文化の不一致',   p: 0.24, sev: 0.5, desc: '統合が進まず、両社の社員の士気が下がる。' },
  { id: 'lawsuit',  name: '係属中の訴訟',       p: 0.11, sev: 0.7, desc: '敗訴すれば和解金の支払いが発生する。' },
  { id: 'customer', name: '顧客の極端な集中',   p: 0.15, sev: 0.6, desc: '主要取引先を失うと売上が一気に消える。' },
  { id: 'system',   name: '基幹システムの老朽化', p: 0.14, sev: 0.4, desc: '統合には想定外のシステム投資が必要になる。' },
];

/** 買収候補を生成 */
export function generateTargets(g, rng, n = 3) {
  const out = [];
  const used = new Set(g.acquisitions.map(a => a.name));
  for (let i = 0; i < n; i++) {
    const tpl = rng.pick(TARGET_TEMPLATES);
    const name = rng.pick(tpl.names.filter(x => !used.has(x)) || tpl.names);
    if (!name || used.has(name)) continue;
    used.add(name);
    const scale = rng.range(0.35, 2.4);
    const rev = Math.round((9000 + rng.range(0, 34000)) * scale / 100) * 100;
    const opMargin = rng.range(0.015, 0.14);
    const op = Math.round(rev * opMargin);
    const np = Math.round(op * rng.range(0.5, 0.72));
    const equity = Math.round(rev * rng.range(0.22, 0.75));
    const employees = Math.round(rev / rng.range(38, 95));
    const quality = clamp01(0.35 + opMargin * 3.2 + rng.normal(0, 0.16));

    const risks = [];
    for (const r of MA_RISKS) {
      let pr = r.p * (1.45 - quality * 0.9);
      if (rng.chance(pr)) risks.push({ ...r, found: false, mag: rng.range(0.5, 1.4) });
    }
    const multiple = rng.range(6.5, 15) * (0.7 + quality * 0.7);
    const askPrice = Math.round((equity * rng.range(0.9, 1.5) + op * multiple) / 100) * 100;

    out.push({
      id: uid('M'), name, kind: tpl.kind, label: tpl.label, icon: tpl.icon,
      synergy: tpl.synergy, effect: { ...tpl.effect },
      rev, op, np, equity, employees, askPrice, quality,
      risks, ddLevel: 0, ddSkill: 0,
      listedWeek: g.week, expires: g.week + rng.int(8, 26),
      note: rng.pick([
        '創業家が後継者不在を理由に売却を検討している。',
        'ファンドが保有しており、出口を探している。',
        '親会社が本業回帰のため売却を決めた。',
        '業績は堅調だが、単独での成長に限界を感じている。',
        '同業他社も関心を示しているとの噂がある。',
      ]),
    });
  }
  return out;
}

/** 買収候補のデューデリジェンス */
export function maDueDiligence(g, t, level, rng) {
  const p = orgPower(g);
  const cost = Math.round(t.askPrice * (level === 1 ? 0.006 : 0.018));
  const base = level === 1 ? 0.45 : 0.85;
  const skill = clamp01(base + (p.corp.quality - 55) / 240 + (p.fin.quality - 55) / 380);
  let found = 0;
  for (const r of t.risks) {
    if (r.found) continue;
    if (rng.chance(skill)) { r.found = true; found++; }
  }
  t.ddLevel = Math.max(t.ddLevel, level); t.ddSkill = skill;
  g.cash -= cost;
  g.finance.quarterAcc.cogsOther += cost;
  return { cost, found };
}

/** 買収を実行する */
export function acquire(g, t, price, rng, news) {
  const p = orgPower(g);
  const goodwill = Math.max(0, price - t.equity);
  g.cash -= price;
  g.goodwill += goodwill;
  const integSpeed = clamp(0.16 + p.corp.quality / 420 + p.hr.quality / 700, 0.12, 0.42);
  const a = {
    id: t.id, name: t.name, kind: t.kind, label: t.label, icon: t.icon,
    price, goodwill, goodwillInit: goodwill, equity: t.equity,
    rev: t.rev, op: t.op, np: t.np, employees: t.employees,
    effect: { ...t.effect }, synergy: t.synergy,
    risks: t.risks.map(r => ({ ...r })),
    integration: 0.12, integSpeed, acquiredWeek: g.week,
    failed: false, troubles: [], health: 1.0,
  };
  g.acquisitions.push(a);
  const i = g.maTargets.indexOf(t);
  if (i >= 0) g.maTargets.splice(i, 1);
  g.company.brand = clamp(g.company.brand + (t.rev > 20000 ? 3 : 1.4) + (t.effect.brand || 0), 0, 100);
  news.push({
    icon: '🤝', type: 'ma',
    text: `${t.label}「${t.name}」を${Math.round(price / 100).toLocaleString()}億円で買収した。のれん${Math.round(goodwill / 100).toLocaleString()}億円を計上。`,
  });
  // 用地付きの買収（中堅デベロッパー）
  if (t.effect.lots) {
    const pool = g.cells.filter(c => c.owner === 'other' && c.d && !c.onSale).slice(0, 200);
    const n = Math.min(pool.length, 1 + Math.floor(t.rev / 16000));
    const picked = rng.shuffle(pool).slice(0, n);
    for (const c of picked) {
      c.owner = 'player';
      c.bookValue = Math.round((c.baseValue || 1000) * 0.9);
      c.vacant = !c.building;
      if (c.building) c.building.owner = 'player';
    }
    if (n) news.push({ icon: '◈', type: 'ma', text: `買収により${n}区画の保有不動産を引き継いだ。` });
  }
  return a;
}

/** 毎週の子会社・買収先の処理 */
export function stepMA(g, rng, news) {
  const p = orgPower(g);

  // --- 買収先のPMI ---
  for (const a of g.acquisitions) {
    if (a.failed) continue;
    const before = a.integration;
    // 統合速度は integSpeed だけで決める。
    // 以前はここで「culture リスクを抱えているか」を見て0.55倍していたが、
    // 未発覚・未発火のリスクでも一律に半減させていたうえ、
    // 実際に顕在化したときの integSpeed *= 0.6 と二重に効いていた
    a.integration = clamp01(a.integration + a.integSpeed / WEEKS_PER_QUARTER);
    if (before < 1 && a.integration >= 1) {
      news.push({ icon: '🔗', type: 'ma', text: `${a.name}の統合（PMI）が完了。シナジーが完全に発現した。` });
    }

    // 連結損益の取り込み
    const dem = g.market.sentiment;
    const perf = clamp(0.62 + a.integration * 0.5 + (dem - 0.5) * 0.3, 0.3, 1.5) * a.health;
    const wRev = a.rev / WEEKS_PER_YEAR * perf;
    const wOp = a.op / WEEKS_PER_YEAR * perf * (a.integration > 0.7 ? 1.12 : 0.85);
    g.finance.quarterAcc.revOther += wRev;
    g.finance.quarterAcc.cogsOther += Math.max(0, wRev - wOp);
    g.cash += wOp;

    // のれん償却（20年定額）
    if (a.goodwill > 0) {
      const am = a.goodwillInit / (20 * WEEKS_PER_YEAR);
      a.goodwill = Math.max(0, a.goodwill - am);
      g.goodwill = Math.max(0, g.goodwill - am);
      g.finance.quarterAcc.cogsOther += am;
    }

    // --- リスクの顕在化 ---
    // 「買収後3年間で通算 base の確率で起きる」を週次に割り戻す。
    // 以前は週あたり 0.19/13 を156週かけていて、通算9割が発火していた
    for (const r of a.risks) {
      if (r.fired) continue;
      const window = g.week - a.acquiredWeek;
      if (window > RISK_WINDOW) continue;
      // 事前に把握できていたリスクは、契約で手当てできるぶん起きにくい
      const base = (0.20 + (r.sev ?? 0.6) * 0.20) * (r.found ? 0.6 : 1);
      if (!rng.chance(1 - Math.pow(1 - base, 1 / RISK_WINDOW))) continue;
      r.fired = true;
      const mitigated = r.found ? 0.45 : 1;     // 事前に把握していれば被害は小さい
      switch (r.id) {
        case 'debt': {
          const loss = Math.round(a.price * 0.16 * r.mag * mitigated);
          g.finance.quarterAcc.extraordinary -= loss; g.cash -= loss;
          a.troubles.push({ id: r.id, loss });
          news.push({ icon: '💥', type: 'ma', text: `${a.name}で簿外債務${Math.round(loss / 100).toLocaleString()}億円が発覚。特別損失を計上した。` });
          break;
        }
        case 'window': {
          a.rev = Math.round(a.rev * (1 - 0.12 * mitigated)); a.op = Math.round(a.op * (1 - 0.3 * mitigated));
          news.push({ icon: '📕', type: 'ma', text: `${a.name}の過年度決算に不適切な会計処理が判明。収益力の前提が崩れた。` });
          break;
        }
        case 'keyman': {
          a.health *= (1 - 0.22 * mitigated);
          for (const k in a.effect) if (typeof a.effect[k] === 'number') a.effect[k] *= (1 - 0.4 * mitigated);
          news.push({ icon: '🚪', type: 'ma', text: `${a.name}の中核人材が相次いで退職。見込んでいたシナジーが縮小した。` });
          break;
        }
        case 'culture': {
          a.integSpeed *= 0.6;
          for (const s of g.staff) if (rng.chance(0.25)) s.morale = clamp01(s.morale - 0.06);
          news.push({ icon: '🧊', type: 'ma', text: `${a.name}との統合で軋轢が生じている。両社の士気が下がった。` });
          break;
        }
        case 'lawsuit': {
          const loss = Math.round(a.price * 0.07 * r.mag * mitigated);
          g.finance.quarterAcc.extraordinary -= loss; g.cash -= loss;
          news.push({ icon: '⚖', type: 'ma', text: `${a.name}が抱えていた訴訟で和解。${Math.round(loss / 100).toLocaleString()}億円を支払った。` });
          break;
        }
        case 'customer': {
          a.rev = Math.round(a.rev * (1 - 0.25 * mitigated)); a.op = Math.round(a.op * (1 - 0.35 * mitigated));
          news.push({ icon: '📉', type: 'ma', text: `${a.name}の最大顧客が取引を停止。売上が大きく落ち込んだ。` });
          break;
        }
        case 'system': {
          const cost = Math.round(a.price * 0.05 * r.mag * mitigated);
          g.cash -= cost; g.finance.quarterAcc.cogsOther += cost;
          news.push({ icon: '💻', type: 'ma', text: `${a.name}の基幹システム刷新に${Math.round(cost / 100).toLocaleString()}億円の追加投資が必要になった。` });
          break;
        }
      }
    }

    // --- のれん減損の判定 ---
    if (a.goodwill > 0 && g.week - a.acquiredWeek >= 52 && rng.chance(0.09 / WEEKS_PER_QUARTER)) {
      const perfNow = a.health * (0.6 + a.integration * 0.5);
      if (perfNow < 0.78) {
        const loss = Math.round(a.goodwill * clamp(1 - perfNow, 0.3, 1));
        a.goodwill -= loss; g.goodwill = Math.max(0, g.goodwill - loss);
        g.finance.quarterAcc.impairment += loss;
        a.impaired = (a.impaired || 0) + loss;
        if (a.goodwill <= 0 && perfNow < 0.55) a.failed = true;
        news.push({
          icon: '🔥', type: 'ma',
          text: `${a.name}の業績が計画を大きく下回り、のれん${Math.round(loss / 100).toLocaleString()}億円を減損処理した。${a.failed ? 'この買収は失敗に終わった。' : ''}`,
        });
        g.company.brand = clamp(g.company.brand - 1.5, 0, 100);
      }
    }
  }

  // --- 子会社の業績 ---
  for (const s of g.subsidiaries) {
    const dem = g.market.sentiment;
    if (s.type === 'overseas') {
      const swing = rng.normal(0.4, 1.4) * (0.5 + dem);
      const pl = s.bookValue * 0.035 * swing / WEEKS_PER_QUARTER;
      g.finance.quarterAcc.revOther += Math.max(0, pl);
      if (pl < 0) g.finance.quarterAcc.extraordinary += pl;
      g.cash += pl;
      s.lastPL = pl;
      s.accPL = (s.accPL || 0) + pl;
      if (Math.abs(s.accPL) > s.bookValue * 0.06) {
        news.push({
          icon: '🌏', type: 'ma',
          text: `海外事業子会社が${Math.round(Math.abs(s.accPL) / 100).toLocaleString()}億円の${s.accPL < 0 ? '損失' : '利益'}を計上した${s.accPL < 0 ? '（現地市況と為替の悪化）' : ''}。`,
        });
        s.health = clamp01(s.health + (s.accPL < 0 ? -0.06 : 0.03));
        s.accPL = 0;
      }
    } else {
      // 事業量に応じた損益。仕事が無ければ固定費だけが残る
      const load = {
        construction: g.projects.length / 3,
        sales: g.inventory.length / 2,
        pm: g.assets.length / 3,
        reit: g.assets.length / 4,
      }[s.type] ?? 1;
      const pl = s.upkeep / WEEKS_PER_YEAR * (load - 1) * 1.6;
      s.lastPL = pl * WEEKS_PER_QUARTER;
      g.finance.quarterAcc.revOther += Math.max(0, pl);
      if (pl < 0) g.finance.quarterAcc.cogsOther += -pl;
      g.cash += pl;
      s.health = clamp01(s.health + (load > 1 ? 0.02 : -0.03) / WEEKS_PER_QUARTER);
      if (s.health < 0.45 && rng.chance(0.2 / WEEKS_PER_QUARTER)) {
        news.push({ icon: '⚠', type: 'ma', text: `${s.name}は業務量が不足しており、固定費が重荷になっている。` });
      }
    }
  }

  // --- 候補の入替 ---
  g.maTargets = g.maTargets.filter(t => t.expires > g.week);
  if (g.maTargets.length < 3 && rng.chance(0.65 / WEEKS_PER_QUARTER)) {
    g.maTargets.push(...generateTargets(g, rng, 1));
  }
}

/** 子会社を設立する */
export function foundSubsidiary(g, typeId, rng, news) {
  const def = SUB_TYPES.find(s => s.id === typeId);
  if (!def) return null;
  const sub = {
    id: uid('S'), type: def.id, name: `${g.company.name}${def.name.replace('子会社', '')}`,
    icon: def.icon, bookValue: def.cost, upkeep: def.upkeep,
    effect: { ...def.effect }, health: 1.0, foundedWeek: g.week, staffIds: [],
  };
  g.cash -= def.cost;
  // 人員を出向させる
  const prefer = { construction: 'cons', sales: 'sales', pm: 'lease', reit: 'fin', overseas: 'corp' }[def.id];
  const pool = g.staff.filter(s => !s.subsidiary && s.rank < 6).sort((a, b) => (a.dept === prefer ? -1 : 1));
  for (let i = 0; i < Math.min(def.staffNeed, pool.length); i++) {
    pool[i].subsidiary = sub.id;
    sub.staffIds.push(pool[i].id);
  }
  g.subsidiaries.push(sub);
  news.push({ icon: def.icon, type: 'ma', text: `${sub.name}を設立した（出資${Math.round(def.cost / 100).toLocaleString()}億円・出向${sub.staffIds.length}名）。` });
  return sub;
}

/** 子会社を清算する */
export function liquidate(g, sub, news) {
  const recover = Math.round(sub.bookValue * 0.45 * sub.health);
  g.cash += recover;
  g.finance.quarterAcc.extraordinary -= (sub.bookValue - recover);
  for (const s of g.staff) if (s.subsidiary === sub.id) delete s.subsidiary;
  const i = g.subsidiaries.indexOf(sub);
  if (i >= 0) g.subsidiaries.splice(i, 1);
  news.push({ icon: '🗑', type: 'ma', text: `${sub.name}を清算した。${Math.round(recover / 100).toLocaleString()}億円を回収し、差額を特別損失に計上した。` });
}

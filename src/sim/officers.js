// ============================================================
//  役員人事 — 社長（プレイヤー）と、その下の役員体制
//    執行役員・取締役は自動で昇格しない。社長が任命する。
//    任命した役員には管掌部門を持たせ、その部門を押し上げる。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPTS, DEPT_IDS, RANKS, CEO_RANK, OFFICER_RANKS, TOP_STAFF_RANK, rankName } from '../data/hrdata.js';
import { avgAbility } from '../core/state.js';

/** 管掌が部門にもたらす押し上げ（能力100の役員が1部門だけ見たときの最大値） */
export const OVERSIGHT = {
  quality: 0.16,     // 部門の質への上乗せ率
  capacity: 0.10,    // 部門の処理能力への上乗せ率
  spread: 0.55,      // 2部門目以降は薄まる（1部門なら1.0、2部門なら0.55ずつ…）
};

/** いまの役員（執行役員・取締役） */
export function officers(g) {
  return g.staff.filter(s => !s.subsidiary && OFFICER_RANKS.includes(s.rank));
}

/** その役職の空き枠 */
export function officerRoom(g, rank) {
  const def = RANKS[rank];
  if (!def) return 0;
  const cur = g.staff.filter(s => !s.subsidiary && s.rank === rank).length;
  return def.slots === Infinity ? 99 : Math.max(0, def.slots - cur);
}

/** その社員をその役職に任命できるか。できないなら理由を返す */
export function canAppoint(g, s, rank) {
  if (!s) return '対象がいない';
  if (!OFFICER_RANKS.includes(rank)) return 'その役職は任命の対象ではない';
  if (s.subsidiary) return '子会社へ出向中である';
  if (s.rank === rank) return 'すでにその役職である';
  if (s.rank > rank) return '現在の役職より下には任命できない';
  if (s.rank < rank - 1) return `${rankName(g, rank - 1)}を経ていない`;
  if (!officerRoom(g, rank)) return `${rankName(g, rank)}の枠が埋まっている（${RANKS[rank].slots}名まで）`;
  return null;
}

/**
 * 任命する。
 * 能力が基準に届かない人物を引き上げると、
 * 本人の士気は上がるが、周りは納得しない。
 */
export function appoint(g, s, rank, news) {
  const err = canAppoint(g, s, rank);
  if (err) return err;
  const def = RANKS[rank];
  const ab = avgAbility(s);
  const from = s.rank;
  s.rank = rank;
  s.officerSince = g.week;
  if (!Array.isArray(s.oversee)) s.oversee = [];
  s.morale = clamp01(s.morale + 0.18);
  s.loyalty = clamp01(s.loyalty + 0.10);

  // 抜擢が妥当かどうかは、同格・上位の顔ぶれと比べて決まる
  const short = Math.max(0, def.minAbility - ab);
  if (short > 0) {
    // 力不足の登用は全社の士気を削る
    for (const x of g.staff) {
      if (x === s || x.subsidiary) continue;
      if (avgAbility(x) > ab && x.rank >= from) x.morale = clamp01(x.morale - Math.min(0.12, short / 90));
    }
    news && news.push({
      icon: '⚠', type: 'hr', major: true,
      text: `${s.name}を${rankName(g, rank)}に任命した。能力は${rankName(g, rank)}の目安（${def.minAbility}）に${short.toFixed(0)}届いておらず、社内に不満が残った。`,
    });
  } else {
    news && news.push({
      icon: '👔', type: 'hr', major: true,
      text: `${s.name}を${rankName(g, rank)}に任命した。`,
    });
  }
  return null;
}

/** 解任する。役職は1つ下に戻る */
export function dismiss(g, s, news) {
  if (!s || !OFFICER_RANKS.includes(s.rank)) return '役員ではない';
  const was = s.rank;
  s.rank = Math.max(0, s.rank - 1);
  s.oversee = [];
  s.officerSince = null;
  s.morale = clamp01(s.morale - 0.34);
  s.loyalty = clamp01(s.loyalty - 0.22);
  news && news.push({
    icon: '📉', type: 'hr', major: true,
    text: `${s.name}を${rankName(g, was)}から解任した。本人の士気は大きく落ちた。`,
  });
  return null;
}

/** 管掌部門を設定する（複数可。持たせすぎると効果が薄まる） */
export function setOversight(g, s, depts) {
  if (!s || !OFFICER_RANKS.includes(s.rank)) return '役員ではない';
  const list = (depts || []).filter(d => DEPTS[d]);
  const cap = s.rank >= 6 ? 4 : 2;         // 取締役は4部門、執行役員は2部門まで
  s.oversee = list.slice(0, cap);
  return null;
}

/**
 * 部門ごとの管掌効果。
 * 同じ部門を複数の役員が見ても、いちばん強い1人ぶんしか効かない。
 */
export function oversightOf(g) {
  const out = {};
  for (const d of DEPT_IDS) out[d] = { quality: 0, capacity: 0, by: null };
  for (const s of officers(g)) {
    const list = Array.isArray(s.oversee) ? s.oversee.filter(d => DEPTS[d]) : [];
    if (!list.length) continue;
    // 見る部門が増えるほど、1部門あたりの手当ては薄くなる
    const spread = list.length <= 1 ? 1 : Math.pow(OVERSIGHT.spread, list.length - 1);
    const lead = (avgAbility(s) * 0.45 + s.abil.lead * 0.55) / 100;
    const rankMul = s.rank >= 6 ? 1.25 : 1;
    for (const d of list) {
      const q = OVERSIGHT.quality * lead * spread * rankMul;
      if (q > out[d].quality) out[d] = { quality: q, capacity: OVERSIGHT.capacity * lead * spread * rankMul, by: s };
    }
  }
  return out;
}

/** 管掌されていない部門 */
export function uncovered(g) {
  const ov = oversightOf(g);
  return DEPT_IDS.filter(d => !ov[d].by);
}

// ------------------------------------------------------------
//  社長（プレイヤー本人）
// ------------------------------------------------------------
/** 社長の情報。無ければ作る（古いセーブ向け） */
export function ceo(g) {
  if (!g.company.ceo) {
    g.company.ceo = { name: '社長', since: g.year || 2026, age: 42 };
  }
  return g.company.ceo;
}

/** 社長の年次報酬（百万円）。給与テーブルの最上段がそのまま役員報酬になる */
export function ceoPay(g) {
  const rp = g.hrPolicy && g.hrPolicy.rankPay;
  const v = rp && rp[CEO_RANK];
  return typeof v === 'number' && isFinite(v) ? v : RANKS[CEO_RANK].baseSalary;
}

/**
 * 社長の報酬が社内にどう映るか。
 * 平社員の何倍かで見る。開きすぎると士気が落ち、低すぎても示しがつかない。
 */
export function payGapView(g) {
  const rp = (g.hrPolicy && g.hrPolicy.rankPay) || [];
  const staffPay = (typeof rp[0] === 'number' && rp[0] > 0) ? rp[0] : RANKS[0].baseSalary;
  const ratio = ceoPay(g) / Math.max(0.1, staffPay);
  let tone = 'ok', text = '社員との開きは常識の範囲である。';
  if (ratio > 22) { tone = 'bad'; text = '社員との開きが大きすぎる。株主にも社員にも説明がつかない。'; }
  else if (ratio > 15) { tone = 'warn'; text = '社員との開きがやや大きい。業績が伴わないと批判される。'; }
  else if (ratio < 4) { tone = 'warn'; text = '社長の報酬が低すぎる。経営責任の重さに見合っていないと見られる。'; }
  return { ratio, tone, text };
}

/** 社長の報酬が士気に与える影響（週次で効かせる係数） */
export function ceoPayMorale(g) {
  const { ratio } = payGapView(g);
  if (ratio > 22) return -0.0022;
  if (ratio > 15) return -0.0008;
  if (ratio < 4) return -0.0006;
  return 0;
}

/**
 * 役員体制の充実度（0〜1）。
 * 空いている役員枠が多いほど、社長ひとりに負荷が集中する。
 */
export function boardStrength(g) {
  const list = officers(g);
  if (!list.length) return 0;
  const need = RANKS[5].slots + RANKS[6].slots;
  const power = list.reduce((a, s) => a + avgAbility(s) / 100, 0);
  return clamp01(power / Math.max(1, need * 0.62));
}

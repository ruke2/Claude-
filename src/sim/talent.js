// ============================================================
//  社内公募と抜擢人事
//    部署をまたいで人を動かし、等級を飛ばして引き上げる。
//    当たれば早く育つが、外すと周りが白ける。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DEPTS, DEPT_IDS, RANKS, TOP_STAFF_RANK, OFFICER_RANKS, rankName } from '../data/hrdata.js';
import { avgAbility } from '../core/state.js';
import { WEEKS_PER_QUARTER } from '../core/time.js';

// ------------------------------------------------------------
//  社内公募
// ------------------------------------------------------------
/**
 * 公募を出す。
 * 手を挙げるのは、いまの部署で伸び悩んでいるか、
 * その仕事に向いた力を持っている人である。
 */
export function openPosting(g, dept, n, rng) {
  if (!DEPTS[dept]) return '部署が正しくない';
  const key = DEPTS[dept].key;
  const cands = g.staff
    .filter(s => !s.subsidiary && s.dept !== dept && s.rank <= TOP_STAFF_RANK)
    .map(s => {
      // 手を挙げる理由：その仕事に向いている／いまの部署がつらい
      const fitScore = s.abil[key];
      const push = (1 - s.morale) * 42 + (s.otHours || 0) * 0.32;
      const pull = fitScore * 0.7 + (s.potential - avgAbility(s)) * 0.5;
      return { s, want: clamp01((pull + push - 42) / 60) };
    })
    .filter(x => x.want > 0.12);

  const applicants = [];
  for (const c of cands) {
    if (rng.chance(c.want * 0.6)) applicants.push({ id: c.s.id, want: Math.round(c.want * 100) });
  }
  g.postings = g.postings || [];
  const rec = {
    id: `post_${dept}_${g.week}`, dept, need: Math.max(1, n | 0),
    week: g.week, deadline: g.week + 4,
    applicants: applicants.slice(0, 18),
  };
  g.postings.push(rec);
  return null;
}

/** 公募に応じた社員を異動させる */
export function acceptPosting(g, post, staffId, news) {
  const s = g.staff.find(x => x.id === staffId);
  if (!s) return '対象がいない';
  const from = s.dept;
  s.dept = post.dept;
  // 手を挙げて通った異動は、通常の異動と違って士気が上がる
  s.morale = clamp01(s.morale + 0.16);
  s.loyalty = clamp01(s.loyalty + 0.08);
  s.movedWeek = g.week;
  post.applicants = post.applicants.filter(a => a.id !== staffId);
  post.filled = (post.filled || 0) + 1;
  news && news.push({
    icon: '🙋', type: 'hr',
    text: `社内公募により、${s.name}が${DEPTS[from].name}から${DEPTS[post.dept].name}へ異動した。`,
  });
  return null;
}

/** 期限切れの公募を片づける */
export function stepPostings(g, news) {
  if (!g.postings || !g.postings.length) return;
  const keep = [];
  for (const p of g.postings) {
    if (g.week < p.deadline) { keep.push(p); continue; }
    if (!p.filled) {
      news && news.push({
        icon: '📭', type: 'hr',
        text: `${DEPTS[p.dept].name}の社内公募は、締切までに配属が決まらなかった。`,
      });
    }
  }
  g.postings = keep;
}

// ------------------------------------------------------------
//  抜擢人事
// ------------------------------------------------------------
/** 抜擢できるか。できないなら理由 */
export function canFastTrack(g, s) {
  if (!s) return '対象がいない';
  if (s.subsidiary) return '子会社へ出向中である';
  const to = s.rank + 2;
  if (to > TOP_STAFF_RANK) return 'これ以上は役員人事の範囲である';
  if (OFFICER_RANKS.includes(to)) return `${rankName(g, to)}は役員人事から任命する`;
  const def = RANKS[to];
  const cur = g.staff.filter(x => x.rank === to && !x.subsidiary).length;
  if (def.slots !== Infinity && cur >= def.slots) return `${rankName(g, to)}の枠が埋まっている`;
  if (s.tenure < 1) return '勤続1年未満である';
  return null;
}

/**
 * 抜擢の成否。
 * 潜在能力と統率が高ければ伸びるが、
 * いまの実力が飛び越える等級に遠すぎると失敗する。
 */
export function fastTrackOdds(g, s) {
  const to = s.rank + 2;
  const need = RANKS[to].minAbility;
  const ab = avgAbility(s);
  const pot = s.potential;
  const base = 0.30
    + clamp((ab - need) / 30, -0.45, 0.35)
    + clamp((pot - need) / 40, -0.2, 0.28)
    + clamp((s.abil.lead - 55) / 120, -0.15, 0.18)
    + clamp((s.morale - 0.6) * 0.3, -0.12, 0.12);
  return clamp01(base);
}

/**
 * 抜擢する。
 * 成功すれば一気に伸び、周りも活気づく。
 * 失敗すると本人が潰れ、実力のある社員の士気が落ちる。
 */
export function fastTrack(g, s, rng, news) {
  const err = canFastTrack(g, s);
  if (err) return { err };
  const to = s.rank + 2;
  const odds = fastTrackOdds(g, s);
  const ok = rng.chance(odds);
  const from = s.rank;
  s.rank = to;
  s.fastTracked = { week: g.week, from, ok };

  if (ok) {
    s.morale = clamp01(s.morale + 0.24);
    s.loyalty = clamp01(s.loyalty + 0.14);
    // 期待に応えて伸びる
    for (const k in s.abil) s.abil[k] = clamp(s.abil[k] + rng.range(2, 7), 0, 99);
    s.potential = Math.min(99, s.potential + rng.int(1, 4));
    // 若手が抜かれた組織は活気づく
    for (const x of g.staff) {
      if (x === s || x.subsidiary) continue;
      if (x.age < s.age && x.potential > 72) x.morale = clamp01(x.morale + 0.05);
    }
    news && news.push({
      icon: '🚀', type: 'hr', major: true,
      text: `${s.name}（${s.age}歳）を${rankName(g, from)}から${rankName(g, to)}に抜擢した。`
        + `期待に応えて力を伸ばしており、若手の目の色が変わっている。`,
    });
  } else {
    s.morale = clamp01(s.morale - 0.22);
    s.loyalty = clamp01(s.loyalty - 0.10);
    // 飛び越された側は納得しない
    let upset = 0;
    for (const x of g.staff) {
      if (x === s || x.subsidiary) continue;
      if (x.rank >= from && x.rank < to && avgAbility(x) > avgAbility(s)) {
        x.morale = clamp01(x.morale - 0.12);
        x.loyalty = clamp01(x.loyalty - 0.06);
        upset++;
      }
    }
    news && news.push({
      icon: '⚠', type: 'hr', major: true,
      text: `${s.name}を${rankName(g, to)}に抜擢したが、荷が勝ちすぎていた。`
        + (upset ? `飛び越された${upset}名の士気が落ちている。` : '本人が抱え込んでしまっている。'),
    });
  }
  return { ok, odds };
}

/** 抜擢の候補（潜在能力が高く、まだ等級が低い人） */
export function fastTrackCandidates(g) {
  return g.staff
    .filter(s => !s.subsidiary && !canFastTrack(g, s))
    .map(s => ({ s, odds: fastTrackOdds(g, s), gap: s.potential - avgAbility(s) }))
    .sort((a, b) => (b.odds * 0.6 + b.gap / 100 * 0.4) - (a.odds * 0.6 + a.gap / 100 * 0.4))
    .slice(0, 20);
}

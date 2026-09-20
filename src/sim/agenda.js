// ============================================================
//  年間カレンダーと決裁事項
//    人事・賞与・総会・春闘は、決まった時期にしか動かない。
//    ところが「その週にモーダルが出るだけ」だと、
//    閉じてしまったあと二度と気づけない。
//
//    ここでは決裁事項を **持ち越す** 形にしている。
//      ・その週が来たら `g.agenda` に積む
//      ・処理するまで画面の上にバッジで残る
//      ・期限を過ぎたら既定の内容で自動処理し、そう知らせる
//
//    **「その週だけ出して終わり」にしないこと。**
//    プレイヤーは1週ずつ進めるとはかぎらない。
//    4週まとめて進めたときに通り過ぎてしまう。
// ============================================================
import { MONTH_WEEKS } from '../core/time.js';
import { hasUnion } from './union.js';
import { suggestedMonths, payBonus, SEASONS } from './bonus.js';

/** 各月の開始週（time.js と同じ並び。ここでは読みやすさのために持つ） */
const M = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];

/**
 * 年間の決まりごと。
 *
 * week      … 議題が立つ週
 * dueWeeks  … 放っておける週数。過ぎたら auto が走る
 * when      … その年に議題が立つ条件
 * auto      … 期限切れのときに代わりに実行する中身
 * panel/tab … 画面でどこを開くか
 */
export const EVENTS = [
  {
    id: 'shunto', week: M[1] + 1, dueWeeks: 6, icon: '📣',
    name: '春季労使交渉', desc: '労働組合の要求に回答する。放っておくとゼロ回答になる。',
    when: g => hasUnion(g),
    // 期限切れの処理は union.js の stepUnion が受け持つ（ゼロ回答）
    auto: () => null,
  },
  {
    id: 'hrCycle', week: M[2], dueWeeks: 4, icon: '📋',
    name: '定期人事の内示', desc: '昇格の枠と評価の厳しさを決める。4月の定期人事に反映される。',
    when: g => (g.staff || []).length >= 12,
    auto: () => null,                 // 何もしなければ、いまの方針のまま4月を迎える
    panel: 'hr', tab: 'policy',
  },
  {
    id: 'bonusSummer', week: SEASONS.summer.decideWeek, dueWeeks: 4, icon: '🎁',
    name: '夏季賞与の決定', desc: '支給月数を決める。決めないまま7月を迎えると、業績どおりの目安で支給される。',
    when: g => (g.staff || []).length > 0,
    auto: (g, news) => payBonus(g, 'summer', suggestedMonths(g), news),
  },
  {
    id: 'meeting', week: 24, dueWeeks: 3, icon: '⚖',
    name: '定時株主総会', desc: '付議する議案を選ぶ。開かないと会社提案は1つもかけられない。',
    when: g => !!g.company.listed,
    auto: (g, news) => {
      news && news.push({
        icon: '⚖', type: 'ir', major: true,
        text: '定時株主総会は、会社提案を付議しないまま終了した。',
      });
      return null;
    },
  },
  {
    id: 'recruitPlan', week: M[8], dueWeeks: 5, icon: '🎓',
    name: '翌年度の採用計画', desc: '新卒の採用人数と初任給、配属の比率を決める。',
    when: g => (g.staff || []).length >= 8,
    auto: () => null,                 // 決めなければ今年と同じ計画で動く
    panel: 'hr', tab: 'recruit',
  },
  {
    id: 'bonusWinter', week: SEASONS.winter.decideWeek, dueWeeks: 4, icon: '🎁',
    name: '冬季賞与の決定', desc: '支給月数を決める。決めないまま12月を迎えると、業績どおりの目安で支給される。',
    when: g => (g.staff || []).length > 0,
    auto: (g, news) => payBonus(g, 'winter', suggestedMonths(g), news),
  },
];

export const eventOf = id => EVENTS.find(e => e.id === id);

/** いま抱えている決裁事項 */
export function pending(g) {
  return (g.agenda || []).filter(a => !a.done);
}

/** 決裁事項を立てる */
function raise(g, e, news) {
  g.agenda = g.agenda || [];
  if (g.agenda.some(a => a.id === e.id && a.year === g.year)) return null;
  const item = { id: e.id, year: g.year, week: g.week, due: g.week + e.dueWeeks, done: false };
  g.agenda.push(item);
  news && news.push({
    icon: e.icon, type: 'hr', major: true,
    text: `【決裁】${e.name}の時期になった。${e.desc}（期限：あと${e.dueWeeks}週）`,
  });
  return item;
}

/** 決裁を済ませた印をつける */
export function settle(g, id) {
  for (const a of g.agenda || []) if (a.id === id && !a.done) { a.done = true; a.settledWeek = g.week; }
}

/**
 * 毎週の処理。
 * 議題を立て、期限を過ぎたものは既定の内容で片づける。
 */
export function stepAgenda(g, news) {
  g.agenda = g.agenda || [];
  const raised = [];
  for (const e of EVENTS) {
    // **`=== week` で判定しないこと。** まとめて進めたときに飛び越える。
    // その年にまだ立てていなくて、週が過ぎていれば立てる
    if (g.weekOfYear < e.week) continue;
    if (!e.when(g)) continue;
    const r = raise(g, e, news);
    if (r) raised.push(e.id);
  }
  // 期限切れ
  const expired = [];
  for (const a of g.agenda) {
    if (a.done || g.week < a.due) continue;
    const e = eventOf(a.id);
    a.done = true; a.expired = true; a.settledWeek = g.week;
    if (e) {
      e.auto && e.auto(g, news);
      news && news.push({
        icon: '⌛', type: 'hr', major: true,
        text: `${e.name}は期限までに決裁されなかった。${e.auto === null ? '' : '既定の内容で処理した。'}`.trim(),
      });
      expired.push(a.id);
    }
  }
  // 古い記録は落とす（2年ぶんだけ残す）
  if (g.agenda.length > 40) g.agenda = g.agenda.slice(-40);
  return { raised, expired, pending: pending(g) };
}

/**
 * 画面に出す一覧。
 * 期限の近い順に並べる。
 */
export function agendaRows(g) {
  return pending(g).map(a => {
    const e = eventOf(a.id) || {};
    return {
      id: a.id, name: e.name || a.id, desc: e.desc || '', icon: e.icon || '•',
      left: Math.max(0, a.due - g.week),
      panel: e.panel || null, tab: e.tab || null,
    };
  }).sort((x, y) => x.left - y.left);
}

/** 今年の予定表（画面用）。済んだものも含めて並べる */
export function yearPlan(g) {
  const monthOf = (w) => { let m = 0; for (let i = 0; i < 12; i++) if (w >= M[i]) m = i; return m + 1; };
  return EVENTS.map(e => {
    const a = (g.agenda || []).find(x => x.id === e.id && x.year === g.year);
    return {
      id: e.id, name: e.name, icon: e.icon, month: monthOf(e.week), desc: e.desc,
      state: !a ? (g.weekOfYear < e.week ? 'future' : e.when(g) ? 'future' : 'skip')
        : a.done ? (a.expired ? 'expired' : 'done') : 'open',
      left: a && !a.done ? Math.max(0, a.due - g.week) : null,
    };
  }).sort((x, y) => x.month - y.month);
}

export { MONTH_WEEKS };

// ============================================================
//  表彰・受賞 — 建てたものが世の中に評価される
//    良い物件を作り続けると賞が付いてくる。
//    ブランドと採用力に効き、受賞歴は会社の履歴として残る。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, GRADES } from '../data/city.js';

/**
 * 賞の種類。
 *  need  … 最低限これだけの評点がないと候補にならない
 *  brand … 受賞したときの企業ブランドの上げ幅
 */
export const AWARDS = [
  {
    id: 'good', name: 'グッドデザイン選定', icon: '◎', need: 55, brand: 1.6, p: 0.55,
    body: '日本デザイン推進機構',
    desc: '意匠と使い勝手が評価された。広く名前が知られるきっかけになる。',
  },
  {
    id: 'arch', name: '建築学会作品賞', icon: '🏛', need: 86, brand: 3.2, p: 0.30,
    body: '日本建築学会',
    desc: '建築としての完成度が評価される、玄人筋に重い賞である。',
  },
  {
    id: 'town', name: 'まちづくり大賞', icon: '🌳', need: 76, brand: 2.6, p: 0.34,
    body: '都市計画協会',
    desc: '街に開かれた計画が評価された。自治体からの信用が増す。',
  },
  {
    id: 'env', name: '環境配慮建築賞', icon: '🍃', need: 66, brand: 2.0, p: 0.36,
    body: '建築環境・省エネルギー機構',
    desc: '省エネと環境性能が評価された。テナントの引き合いが強くなる。',
  },
  {
    id: 'bcs', name: '建築業協会賞（BCS賞）', icon: '🏆', need: 96, brand: 4.4, p: 0.20,
    body: '日本建設業連合会',
    desc: '事業主・設計・施工の三者が受賞する、業界で最も格の高い賞のひとつ。',
  },
  {
    id: 'renewal', name: 'リニューアル建築賞', icon: '♻', need: 62, brand: 1.8, p: 0.30,
    body: '建築保全センター',
    desc: '既存ストックを活かした再生が評価された。',
  },
];

/**
 * 物件の評点。
 * グレード・規模・用途・地区の格・ブランドで決まる。
 * 標準仕様の小さな建物は、いくら数を作っても賞には届かない。
 */
export function meritOf(g, a) {
  const d = DISTRICTS[a.district];
  const gradeScore = { standard: 6, high: 34, luxury: 58 }[a.grade] ?? 6;
  // 規模は1万坪あたりから効きはじめる。小さな建物はいくら数を作っても届かない
  const size = clamp((Math.log10(Math.max(1, a.gfa || a.nra || 1000)) - 3.4) * 30, 0, 30);
  const height = clamp((a.floors || 1) * 0.55, 0, 16);
  const place = d ? clamp(d.station * 14, 0, 14) : 6;
  const brand = clamp(g.company.brand / 9, 0, 11);
  const mix = a.use === 'mixed' ? 8 : a.use === 'office' || a.use === 'retail' ? 4 : 0;
  return Math.round(gradeScore + size + height + place + brand + mix);
}

/** その物件が狙える賞 */
export function candidatesFor(g, a) {
  const m = meritOf(g, a);
  return AWARDS.filter(x => m >= x.need);
}

/**
 * 四半期ごとの審査。
 * 竣工から2年以内の物件が対象で、1件につき1つの賞まで。
 */
export function stepAwards(g, rng, news) {
  g.awards = g.awards || [];
  const pool = (g.assets || []).concat(g.inventory || [])
    .filter(a => a.completedWeek != null && g.week - a.completedWeek <= 104 && !a.awarded);
  if (!pool.length) return [];

  const won = [];
  for (const a of pool) {
    const m = meritOf(g, a);
    const cands = AWARDS.filter(x => m >= x.need);
    if (!cands.length) continue;
    // 評点が基準をどれだけ上回っているかで当選確率が動く
    const pick = rng.weighted(cands.map(x => ({ x, w: x.p * (1 + (m - x.need) / 40) })));
    if (!pick) continue;
    // 四半期ごとの審査。基準を大きく上回るほど通りやすい
    const chance = clamp01(pick.x.p * (0.22 + (m - pick.x.need) / 55) * 0.40);
    if (!rng.chance(chance)) continue;

    a.awarded = pick.x.id;
    const rec = {
      id: pick.x.id, name: pick.x.name, icon: pick.x.icon, body: pick.x.body,
      year: g.year, week: g.week, merit: m,
      asset: a.name, district: a.district, use: a.use, grade: a.grade,
    };
    g.awards.push(rec);
    if (g.awards.length > 120) g.awards.shift();
    g.company.brand = clamp(g.company.brand + pick.x.brand, 0, 100);
    won.push(rec);
    news && news.push({
      icon: pick.x.icon, type: 'award', major: true,
      text: `「${a.name}」が${pick.x.body}の${pick.x.name}を受賞した。${pick.x.desc}企業ブランドが上がった。`,
    });
  }
  return won;
}

/** 受賞歴のまとめ */
export function awardSummary(g) {
  const list = g.awards || [];
  const byId = {};
  for (const a of list) byId[a.id] = (byId[a.id] || 0) + 1;
  return {
    total: list.length,
    byId,
    recent: list.slice(-8).reverse(),
    top: AWARDS.filter(x => byId[x.id]).sort((a, b) => b.brand - a.brand)[0] || null,
  };
}

/** 受賞歴が採用力に与える上乗せ（employerAppeal に足す） */
export function awardAppeal(g) {
  const list = g.awards || [];
  if (!list.length) return 0;
  // 直近5年ぶんだけ効く。古い栄光は学生には届かない
  const recent = list.filter(a => g.week - a.week <= 260).length;
  return clamp(Math.sqrt(recent) * 0.018, 0, 0.10);
}

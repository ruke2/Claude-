// ============================================================
//  区画の集約（種地の取得・一体開発）
//
//    隣り合う区画を買い足して、1つの大きな敷地にする。
//
//    なぜ要るか。地図の大きな区画は数が限られている。
//    小口の土地しか回ってこなくなったとき、
//    **大きな敷地は「探すもの」ではなく「作るもの」**になる。
//    実際のデベロッパーの大型再開発は、たいていこの積み重ねである。
//
//    ・隣の区画を1つずつ、地権者と交渉して買う
//    ・地権者には強気な人がいる。1人でも折れないと敷地はつながらない
//    ・途中でやめると、買った土地は小さな飛び地として手元に残る
//
//    **「金を積めば必ず買える」にしないこと。**
//    ごねる相手が出るから種地の取得は難しい。
//    確実に買えるなら、ただ時間がかかるだけの作業になってしまう。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { DISTRICTS, TERRAIN, cityOf } from '../data/city.js';
import { uid, cellAt } from '../core/state.js';
import { landAppraisal } from './valuation.js';
import { orgPower } from './hr.js';
import { isHome } from './company.js';

/** 一度に交渉できる種地の数 */
export const MAX_PARCELS = 3;

/** 同時に進められる集約の件数 */
export const MAX_ASSEMBLIES = 2;

/** 地権者の顔ぶれ。誰が持っているかで折れやすさが変わる */
const OWNERS = [
  { name: '個人地権者（相続で取得）', resist: 0.28, note: '相続で受け継いだ土地で、思い入れは薄い。' },
  { name: '個人地権者（先代からの居宅）', resist: 0.78, note: '先代からこの土地に住んでおり、動く気はないという。' },
  { name: '中小の事業会社', resist: 0.42, note: '社屋として使っているが、移転先があれば応じる構えである。' },
  { name: '借地人つきの底地', resist: 0.66, note: '借地人との調整が必要で、話が二重になる。' },
  { name: '宗教法人', resist: 0.84, note: '簡単に手放す性質の土地ではない。' },
  { name: '不動産業者（転売目的）', resist: 0.18, note: '端から売る前提で持っており、値段さえ合えば早い。' },
  { name: '駐車場運営会社', resist: 0.24, note: '暫定利用の駐車場で、収益は大きくない。' },
  { name: '地元の商店主', resist: 0.55, note: '代替の店舗を用意できるかが焦点になる。' },
];

/** 4方向の隣 */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 種地になりうる隣の区画 */
export function neighborsOf(g, cell) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const n = cellAt(g, cell.gx + dx, cell.gy + dy);
    if (!n) continue;
    if (n.terrain !== TERRAIN.LOT || !n.d) continue;
    if (n.d !== cell.d) continue;                       // 地区をまたぐ集約はしない
    if (n.owner === 'player' || n.assetId || n.projectId || n.invId) continue;
    if (n.mergedInto || n.onSale) continue;
    out.push(n);
  }
  return out;
}

/** 集約を始められる自社の更地 */
export function assemblyBases(g) {
  return g.cells.filter(c =>
    c.owner === 'player' && !c.isHQ && !c.building && !c.projectId && !c.assetId && !c.invId
    && !c.mergedInto && !activeFor(g, c.id)
    && neighborsOf(g, c).length > 0);
}

/** その区画で進行中の集約 */
export function activeFor(g, cellId) {
  return (g.assemblies || []).find(a => a.baseId === cellId) || null;
}

/**
 * 交渉を始める。
 * 種地を選び、地権者ごとに希望価格と折れにくさを決める。
 */
export function startAssembly(g, base, targets, rng, news) {
  g.assemblies = g.assemblies || [];
  if (g.assemblies.length >= MAX_ASSEMBLIES) {
    return { ok: false, message: `同時に進められる交渉は${MAX_ASSEMBLIES}件までである` };
  }
  if (!targets.length) return { ok: false, message: '隣に買える区画がない' };
  // 地権者は重ならないように引く。
  // **毎回 `rng.pick` しないこと。** 同じ「先代からの居宅」が3人並ぶと、
  // 区画ごとに違う相手と話しているようには見えない
  const bag = rng.shuffle(OWNERS.slice());
  const parcels = targets.slice(0, MAX_PARCELS).map((c, i) => {
    const o = bag[i % bag.length];
    const app = landAppraisal(g, c);
    return {
      cellId: c.id, area: c.area,
      appraisal: Math.round(app),
      // 種地は相場では買えない。足元を見られる
      ask: Math.round(app * (1.22 + o.resist * 0.55 + rng.range(-0.06, 0.10))),
      owner: o.name, note: o.note,
      resist: clamp01(o.resist + rng.range(-0.08, 0.08)),
      offer: 0, weeks: 0, status: 'open',    // open / deal / holdout
    };
  });
  const a = {
    id: uid('G'), baseId: base.id, district: base.d,
    parcels, week: g.week, spent: 0, rounds: 0,
  };
  g.assemblies.push(a);
  news && news.push({
    icon: '🤝', type: 'land', major: true,
    text: `${DISTRICTS[base.d].name}で用地の集約に着手した。隣接${parcels.length}区画の地権者と交渉に入る。`,
  });
  return { ok: true, assembly: a };
}

/** 提示額を出す（1区画ぶん） */
export function offerParcel(g, a, parcel, amount, news) {
  if (parcel.status !== 'open') return { ok: false, message: 'この区画の交渉は終わっている' };
  if (amount > g.cash) return { ok: false, message: '手元資金が足りない' };
  parcel.offer = Math.round(amount);
  a.rounds++;
  return { ok: true };
}

/**
 * 毎週の交渉。
 * 提示額と希望価格の差、地権者の頑固さ、用地開発部の力で決まる。
 *
 * **その場で決めないこと。** 種地の取得に時間がかかるのが肝である。
 */
export function stepAssembly(g, rng, news) {
  for (const a of (g.assemblies || []).slice()) {
    const p = orgPower(g);
    const cell = g.cells.find(c => c.id === a.baseId);
    // 交渉力。用地開発部の質と、地元かどうか
    const skill = clamp01(0.42 + (p.land.quality - 55) / 200 + (cell && isHome(g, cell.d) ? 0.10 : 0));
    for (const pc of a.parcels) {
      if (pc.status !== 'open') continue;
      pc.weeks++;
      if (pc.offer <= 0) continue;                 // まだ値を出していない
      const ratio = pc.offer / Math.max(1, pc.ask);
      // 折れる確率。相場の何倍を出すかで大きく変わる
      let chance = clamp01((ratio - 0.86) * 1.9) * (1 - pc.resist * 0.55) * (0.5 + skill * 0.7);
      // 長く粘るほど、相手も疲れる
      chance *= 1 + Math.min(0.6, pc.weeks * 0.02);
      // **週あたりに割り戻すこと。** そのまま使うと数週間でまとまってしまい、
      // 種地の取得が「時間のかかる仕事」に見えなくなる
      if (rng.chance(chance * 0.13)) {
        acquireParcel(g, a, pc, news);
        continue;
      }
      // ごねる。希望価格が跳ね上がり、以後は折れにくくなる。
      // **提示額と無関係にしないこと。** 十分な額を出している相手が
      // 同じ確率で態度を硬化させるのは、交渉として筋が通らない
      const hard = (0.010 + pc.resist * 0.017) * clamp(1.7 - ratio, 0.30, 1.5);
      if (pc.weeks > 6 && rng.chance(hard)) {
        pc.status = 'holdout';
        pc.ask = Math.round(pc.ask * (1.18 + pc.resist * 0.25));
        pc.resist = clamp01(pc.resist + 0.15);
        news && news.push({
          icon: '🙅', type: 'land', major: true,
          text: `${DISTRICTS[a.district].name}の集約で、${pc.owner}が態度を硬化させた。`
            + `希望価格は${Math.round(pc.ask / 100).toLocaleString()}億円に引き上げられている。`,
        });
      }
    }
    // 全部まとまったら合筆する
    if (a.parcels.every(pc => pc.status === 'deal')) mergeAssembly(g, a, news);
  }
}

/** ごねた相手に、もう一度話を持ちかける（成功すれば交渉のテーブルに戻る） */
export function reopenParcel(g, a, pc, rng, news) {
  if (pc.status !== 'holdout') return { ok: false, message: 'その区画はごねていない' };
  const p = orgPower(g);
  const fee = Math.round(pc.ask * 0.012);          // 仲介・コンサルの費用
  if (fee > g.cash) return { ok: false, message: '手元資金が足りない' };
  g.cash -= fee;
  a.spent += fee;
  const skill = clamp01(0.35 + (p.land.quality - 55) / 200 + (p.corp.quality - 55) / 320);
  if (rng.chance(skill * 0.55)) {
    pc.status = 'open';
    pc.weeks = 0;
    news && news.push({ icon: '🤝', type: 'land', text: `${pc.owner}が再び交渉のテーブルに着いた。` });
    return { ok: true, fee };
  }
  return { ok: false, fee, message: '取り付く島もなかった。費用だけがかかった' };
}

/** 1区画を取得する */
function acquireParcel(g, a, pc, news) {
  const cell = g.cells.find(c => c.id === pc.cellId);
  if (!cell) { pc.status = 'deal'; return; }
  const fee = Math.round(pc.offer * 0.035);        // 仲介手数料・登記
  g.cash -= pc.offer + fee;
  a.spent += pc.offer + fee;
  cell.owner = 'player';
  cell.building = null;
  cell.vacant = true;
  cell.bookValue = pc.offer + fee;
  cell.lastPaid = pc.offer + fee;
  // 合筆までのあいだ、単独で着工されないように印を付ける
  cell.pendingMerge = a.baseId;
  pc.status = 'deal';
  pc.paid = pc.offer + fee;
  news && news.push({
    icon: '📜', type: 'land',
    text: `${DISTRICTS[a.district].name}の種地1区画（${pc.area.toLocaleString()}坪）を`
      + `${Math.round(pc.offer / 100).toLocaleString()}億円で取得した（${pc.owner}）。`,
  });
}

/**
 * 合筆する。
 * 種地の面積を母屋の区画に寄せ、種地は「一体の敷地の一部」として印を付ける。
 *
 * **種地を地図から消さないこと。** 区画のIDは位置で決まっており、
 * `remapCells()` がIDで古いセーブと突き合わせている。消すと引き継げなくなる。
 */
export function mergeAssembly(g, a, news) {
  const base = g.cells.find(c => c.id === a.baseId);
  if (!base) return;
  let added = 0, addedValue = 0;
  let book = base.bookValue || base.lastPaid || 0;
  for (const pc of a.parcels) {
    const c = g.cells.find(x => x.id === pc.cellId);
    if (!c || pc.status !== 'deal') continue;
    added += c.area;
    // **`baseValue` も寄せること。** `landAppraisal()` はこの値しか見ていない。
    // 面積だけ増やすと、敷地は広がったのに相場の評価額が元のままになり、
    // 貸借対照表でも残余法でも土地が過小に評価される
    addedValue += c.baseValue || 0;
    book += c.bookValue || 0;
    c.mergedInto = base.id;
    c.pendingMerge = null;
    c.area = 0;                  // 敷地は母屋に寄せた
    c.baseValue = 0;
    c.bookValue = 0;
    c.lastPaid = 0;
    c.vacant = true;
    c.owner = 'player';
  }
  base.area += added;
  base.baseValue = (base.baseValue || 0) + addedValue;
  base.bookValue = Math.round(book);
  base.lastPaid = Math.round(book);
  base.merged = (base.merged || []).concat(a.parcels.filter(p => p.status === 'deal').map(p => p.cellId));

  const i = (g.assemblies || []).indexOf(a);
  if (i >= 0) g.assemblies.splice(i, 1);

  news && news.push({
    icon: '🏗', type: 'land', major: true,
    text: `${DISTRICTS[a.district].name}の用地集約がまとまった。`
      + `敷地は ${(base.area - added).toLocaleString()}坪 → <b>${base.area.toLocaleString()}坪</b> になった`
      + `（取得費の合計 ${Math.round(a.spent / 100).toLocaleString()}億円）。`,
  });
}

/**
 * 交渉を打ち切る。
 * **買った土地は返らない。** 飛び地として手元に残る。
 * これが集約の怖さである。
 */
export function abandonAssembly(g, a, news) {
  const got = a.parcels.filter(p => p.status === 'deal').length;
  // 印を外して、普通の飛び地に戻す
  for (const pc of a.parcels) {
    const c = g.cells.find(x => x.id === pc.cellId);
    if (c) c.pendingMerge = null;
  }
  const i = (g.assemblies || []).indexOf(a);
  if (i >= 0) g.assemblies.splice(i, 1);
  news && news.push({
    icon: '—', type: 'land', major: got > 0,
    text: `${DISTRICTS[a.district].name}の用地集約を断念した。`
      + (got ? `すでに取得した${got}区画は、飛び地のまま手元に残る。` : '取得した区画は無い。'),
  });
}

/** 表示用 */
export function assemblyRows(g) {
  return (g.assemblies || []).map(a => {
    const base = g.cells.find(c => c.id === a.baseId);
    const done = a.parcels.filter(p => p.status === 'deal');
    // 種地の面積は、合筆するまで各区画に残っている。
    // まとまったときの敷地面積は「母屋 ＋ 全種地」である
    const futureArea = (base ? base.area : 0) + a.parcels.reduce((s, p) => s + p.area, 0);
    return {
      assembly: a, base,
      district: DISTRICTS[a.district],
      done: done.length, total: a.parcels.length,
      futureArea,
      baseArea: base ? base.area : 0,
      spent: a.spent,
      holdouts: a.parcels.filter(p => p.status === 'holdout').length,
    };
  });
}

// ============================================================
//  全地区×全用途の事業収支を一覧する検算スクリプト
//    node scripts/check-districts.mjs
//  地区やパラメータを触ったら必ず流して、狙いどおりか確かめる
// ============================================================
import { createGame } from '../src/core/state.js';
import { DISTRICTS, USES, TERRAIN } from '../src/data/city.js';
import { devPlan, bestUseFit } from '../src/sim/valuation.js';

const g = createGame({ companyName: 'テスト', difficulty: 'normal', seed: 7 });
const useIds = Object.keys(USES);
const dids = Object.keys(DISTRICTS);

// 各地区の代表的な区画（面積が中位のもの）で、用途ごとの事業利益率を出す
const pick = d => {
  const cs = g.cells.filter(c => c.d === d && c.terrain === TERRAIN.LOT);
  cs.sort((a, b) => a.area - b.area);
  return cs[Math.floor(cs.length / 2)];
};

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)));
console.log(pad('地区', 14) + pad('最有効', 10) + useIds.map(u => pad(USES[u].short, 7)).join(''));
for (const d of dids) {
  const c = pick(d);
  if (!c) { console.log(pad(DISTRICTS[d].short, 14) + '区画なし'); continue; }
  const row = useIds.map(u => {
    const p = devPlan(g, c, u, 'standard');
    if (!p || !p.totalCost) return pad('—', 7);
    const r = p.profit / p.totalCost * 100;
    return pad(r.toFixed(0) + '%', 7);
  });
  console.log(pad(DISTRICTS[d].short, 14) + pad(USES[bestUseFit(c)].short, 10) + row.join(''));
}

console.log('\n■ 区画の規模と価格（中位の区画）');
console.log(pad('地区', 14) + pad('面積', 9) + pad('容積率', 8) + pad('想定地価', 11) + pad('最有効利用', 12) + '利益率');
for (const d of dids) {
  const c = pick(d);
  if (!c) continue;
  const best = bestUseFit(c);
  const p = devPlan(g, c, best, 'standard');
  console.log(pad(DISTRICTS[d].short, 14) + pad(c.area + '坪', 9) + pad(c.far + '%', 8)
    + pad((p.landCost / 100).toFixed(1) + '億円', 11) + pad(USES[best].name, 12)
    + (p.profit / p.totalCost * 100).toFixed(1) + '%');
}

console.log('\n■ 新しい地区で成り立つ用途（利益率10%以上）');
for (const d of ['F', 'M', 'E', 'W']) {
  const c = pick(d);
  const ok = useIds.map(u => ({ u, p: devPlan(g, c, u, 'standard') }))
    .filter(x => x.p && x.p.totalCost && x.p.profit / x.p.totalCost >= 0.10)
    .sort((a, b) => b.p.profit / b.p.totalCost - a.p.profit / a.p.totalCost)
    .map(x => `${USES[x.u].name} ${(x.p.profit / x.p.totalCost * 100).toFixed(0)}%`);
  console.log(`  ${pad(DISTRICTS[d].name, 32)}${ok.join('／') || '★なし'}`);
}

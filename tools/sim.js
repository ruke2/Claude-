/* ヘッドレス・バランス検証:  node tools/sim.js [months] [runs] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const store = {};
const sandbox = {
  window: {}, console,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  Math, Date, JSON, Object, Array, String, Number, isNaN, parseFloat,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['js/data.js', 'js/engine.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f }));
const E = sandbox.window.ENGINE, D = sandbox.window.GAME;
const policy = require('./policy')(E, D);

const MONTHS = +(process.argv[2] || 240), RUNS = +(process.argv[3] || 20);
const VERBOSE = process.env.V === '1';

function playOne(verbose) {
  E.newGame('検証商事');
  const S = E.S;
  if (process.env.NOAUTO) E.setAuto({ on: false });
  const promo = [];
  for (let m = 0; m < MONTHS && !S.over && !S.cleared; m++) {
    policy(S);
    const out = E.advance();
    if (out.fy && !process.env.NOBUDGET) policy.annual(S, out.fy);
    else if (out.fy) E.payout({ ratio: 0.3, buyback: 0 });
    if (out.promote) promo.push(S.turn);
    if (verbose && (m % 12 === 0 || out.promote)) {
      console.log('  m' + String(m).padStart(3) + ' ' + E.stage().name.padEnd(9) +
        ' 純資産 ' + E.money(E.equity()).padStart(9) + ' 現金 ' + E.money(S.cash).padStart(9) +
        ' 借入 ' + E.money(S.debt).padStart(9) + ' 社員 ' + String(S.staff).padStart(5) +
        ' 資産 ' + String(S.assets.length).padStart(2) + ' ' + E.rating().label);
    }
  }
  const ph = S.planHistory || [];
  const ppl = S.people || [];
  return { plans: ph.length, planOk: ph.reduce((a, x) => a + x.count, 0), planFull: ph.filter(x => x.count === 3).length,
           bonus: S.planBonus || 0,
           autoBid: (S.autoStats||{}).bid||0, autoWon: (S.autoStats||{}).won||0,
           gov: S.gov || 0, scandals0: S.scandals || 0, terms: S.ceoTerms || 0,
           ousted: S.overReason === 'ousted' ? 1 : 0, tobbed: S.overReason === 'tob' ? 1 : 0,
           org: S.org,
           ma: (S.maStats || {}).done || 0, pmiOk: (S.maStats || {}).pmiOk || 0,
           pmiNg: (S.maStats || {}).pmiNg || 0, exits: (S.maStats || {}).exits || 0,
           people: ppl.length, avgAge: ppl.length ? ppl.reduce((a, p) => a + p.age, 0) / ppl.length : 0,
           power: ppl.length ? ppl.reduce((a, p) => a + E.personPower(p), 0) / ppl.length : 0,
           morale: S.morale || 0,
           stage: S.stage, eq: E.equity(), over: S.over, cleared: S.cleared, turn: S.turn,
           rank: E.myRank(), assets: S.assets.length, won: S.stats.won, lost: S.stats.lost,
           impair: S.stats.impair, def: S.stats.defaults, promo: promo };
}

console.log('=== sample run ===');
playOne(true);
console.log('\n=== ' + RUNS + ' runs x ' + MONTHS + ' months ===');
const res = [];
for (let i = 0; i < RUNS; i++) res.push(playOne(false));
const dist = {};
res.forEach(r => { const n = D.STAGES[r.stage].name; dist[n] = (dist[n] || 0) + 1; });
const avg = k => res.reduce((s, r) => s + r[k], 0) / res.length;
const med = k => { const a = res.map(r => r[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
console.log('倒産率      :', (res.filter(r => r.over).length / RUNS * 100).toFixed(0) + '%');
console.log('クリア率    :', (res.filter(r => r.cleared).length / RUNS * 100).toFixed(0) + '%');
console.log('クリア月数  :', res.filter(r => r.cleared).map(r => r.turn).sort((a, b) => a - b).join(', ') || '-');
console.log('到達ステージ:', dist);
console.log('純資産 中央値:', E.money(med('eq')));
console.log('平均順位    :', avg('rank').toFixed(1));
console.log('落札率      :', (avg('won') / (avg('won') + avg('lost')) * 100).toFixed(0) + '%');
console.log('減損/貸倒   :', avg('impair').toFixed(1), '/', avg('def').toFixed(1));
const orgd = {}; res.forEach(r => { orgd[r.org] = (orgd[r.org] || 0) + 1; });
console.log('組織/統治   :', JSON.stringify(orgd), 'ガバナンス ' + avg('gov').toFixed(0) + ', 任期 ' + avg('terms').toFixed(1) + '期, 解任 ' + res.reduce((a,r)=>a+r.ousted,0) + '件, 被買収 ' + res.reduce((a,r)=>a+r.tobbed,0) + '件');
console.log('定型商談    :', avg('autoBid').toFixed(0) + '件応札 / ' + avg('autoWon').toFixed(0) + '件受注');
console.log('M&A         :', avg('ma').toFixed(1) + '件, 統合成功 ' + avg('pmiOk').toFixed(1) + ' / 失敗 ' + avg('pmiNg').toFixed(1) + ', EXIT ' + avg('exits').toFixed(1));
console.log('人材        :', avg('people').toFixed(1) + '名, 平均年齢 ' + avg('avgAge').toFixed(0) + ', 平均能力 ' + avg('power').toFixed(0) + ', 士気 ' + avg('morale').toFixed(0));
const tp = res.reduce((a, r) => a + r.plans, 0), to = res.reduce((a, r) => a + r.planOk, 0), tf = res.reduce((a, r) => a + r.planFull, 0);
console.log('中計        :', tp + '期, 項目達成率 ' + (tp ? (to / (tp * 3) * 100).toFixed(0) : 0) + '%, 全項目達成 ' + (tp ? (tf / tp * 100).toFixed(0) : 0) + '%, 実績ボーナス平均 ' + avg('bonus').toFixed(2));
const allPromo = res.map(r => r.promo).filter(p => p.length);
for (let i = 0; i < 5; i++) {
  const t = allPromo.map(p => p[i]).filter(x => x != null).sort((a, b) => a - b);
  if (t.length) console.log('  昇格' + (i + 1) + '（' + D.STAGES[i + 1].name + '）中央値 ' + t[Math.floor(t.length / 2)] + 'ヶ月 / ' + t.length + '/' + RUNS + '件');
}

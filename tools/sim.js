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
  const promo = [];
  for (let m = 0; m < MONTHS && !S.over && !S.cleared; m++) {
    policy(S);
    const out = E.advance();
    if (out.fy) E.payout(S.debt > E.equity() ? 'none' : 'normal');
    if (out.promote) promo.push(S.turn);
    if (verbose && (m % 12 === 0 || out.promote)) {
      console.log('  m' + String(m).padStart(3) + ' ' + E.stage().name.padEnd(9) +
        ' 純資産 ' + E.money(E.equity()).padStart(9) + ' 現金 ' + E.money(S.cash).padStart(9) +
        ' 借入 ' + E.money(S.debt).padStart(9) + ' 社員 ' + String(S.staff).padStart(5) +
        ' 資産 ' + String(S.assets.length).padStart(2) + ' ' + E.rating().label);
    }
  }
  return { stage: S.stage, eq: E.equity(), over: S.over, cleared: S.cleared, turn: S.turn,
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
const allPromo = res.map(r => r.promo).filter(p => p.length);
for (let i = 0; i < 5; i++) {
  const t = allPromo.map(p => p[i]).filter(x => x != null).sort((a, b) => a - b);
  if (t.length) console.log('  昇格' + (i + 1) + '（' + D.STAGES[i + 1].name + '）中央値 ' + t[Math.floor(t.length / 2)] + 'ヶ月 / ' + t.length + '/' + RUNS + '件');
}

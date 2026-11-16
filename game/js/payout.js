// 払戻金の計算（ゲーム内の目安）
// 各馬の単勝オッズから勝つ確率を見積もり、ハービルの式で2着・3着までの確率を出す。
// 券種ごとの払戻率は JRA の設定払戻率に合わせる（単勝・複勝 80%、枠連・馬連・ワイド 77.5%、馬単・3連複 75%、3連単 72.5%）。
// 実際の払戻金は売れ方で決まるので、確率に少しだけばらつきを入れる。
(function () {
  const RATE = { win: 0.8, place: 0.8, waku: 0.775, quin: 0.775, wide: 0.775, exa: 0.75, trio: 0.75, tri: 0.725 };
  const LABEL = { win: '単勝', place: '複勝', waku: '枠連', quin: '馬連', wide: 'ワイド', exa: '馬単', trio: '3連複', tri: '3連単' };
  // 組み合わせごとに決まった小さなばらつき（同じレースなら毎回同じ）
  function noise(seed, key) {
    let h = 2166136261 ^ seed;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.exp((((h >>> 0) % 1000) / 1000 - 0.5) * 0.3);
  }
  const yen = (rate, p) => Math.max(100, Math.floor(rate / Math.max(1e-6, p) * 100 / 10) * 10);

  // race: field（odds・waku）、result（hid・pos）を持つレース
  function compute(race) {
    const F = race.field, n = F.length;
    if (!race.result || n < 2) return [];
    const num = (hid) => F.findIndex(f => f.hid === hid) + 1;
    const waku = F.map(f => f.waku || 0);
    const seed = (race.no || 1) * 7919 + n * 104729 + Math.round((race.result[0].time || 0) * 100);
    // 勝つ確率（単勝オッズの逆数を合計1にそろえる）
    let p = F.map(f => 1 / Math.max(1.05, f.odds || 10));
    // 人気薄どうしの組み合わせはハービルの式だと確率が小さく出すぎるので、少しならす
    p = p.map(x => Math.pow(x, 0.85));
    const sp = p.reduce((a, b) => a + b, 0); p = p.map(x => x / sp);
    const P2 = (i, j) => p[i] * p[j] / (1 - p[i]);
    const P3 = (i, j, k) => P2(i, j) * p[k] / (1 - p[i] - p[j]);
    const order = race.result.slice().sort((a, b) => a.pos - b.pos).map(r => num(r.hid) - 1);
    const [a, b, c] = order;
    const placeN = n <= 7 ? 2 : 3; // 7頭以下は複勝が2着まで
    // 全組み合わせの確率（人気の順位をつけるため）
    const all = { quin: [], exa: [], wide: [], trio: [], tri: [], place: [], waku: {} };
    const inTop = new Array(n).fill(0), pairTop3 = {};
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const q = P2(i, j);
      all.exa.push({ k: `${i}-${j}`, p: q * noise(seed, 'e' + i + '-' + j) });
      if (i < j) all.quin.push({ k: `${i}-${j}`, p: (q + P2(j, i)) * noise(seed, 'q' + i + '-' + j) });
      const wk = [waku[i], waku[j]].sort((x, y) => x - y).join('-');
      all.waku[wk] = (all.waku[wk] || 0) + q;
      if (placeN === 2) { inTop[i] += q; inTop[j] += q; const pk = [i, j].sort((x, y) => x - y).join('-'); pairTop3[pk] = (pairTop3[pk] || 0) + q; }
      else for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const t = P3(i, j, k);
        all.tri.push({ k: `${i}-${j}-${k}`, p: t * noise(seed, 't' + i + '-' + j + '-' + k) });
        inTop[i] += t; inTop[j] += t; inTop[k] += t;
        [[i, j], [i, k], [j, k]].forEach(([x, y]) => { const pk = x < y ? `${x}-${y}` : `${y}-${x}`; pairTop3[pk] = (pairTop3[pk] || 0) + t; });
      }
    }
    if (placeN === 3) {
      const tr = {};
      all.tri.forEach(o => { const k = o.k.split('-').map(Number).sort((x, y) => x - y).join('-'); tr[k] = (tr[k] || 0) + o.p; });
      all.trio = Object.entries(tr).map(([k, v]) => ({ k, p: v }));
    }
    all.place = inTop.map((v, i) => ({ k: String(i), p: v / placeN * noise(seed, 'p' + i) }));
    all.wide = Object.entries(pairTop3).map(([k, v]) => ({ k, p: v / placeN * noise(seed, 'w' + k) }));
    const wakuArr = Object.entries(all.waku).map(([k, v]) => ({ k, p: v * noise(seed, 'k' + k) }));
    const rank = (arr, key) => { const me = arr.find(o => o.k === key); return me ? { p: me.p, pop: arr.filter(o => o.p > me.p).length + 1 } : { p: 0.001, pop: arr.length }; };
    const U = (i) => i + 1;
    const rows = [];
    // 単勝
    rows.push({ t: 'win', combo: [String(U(a))], pay: Math.max(100, Math.round((F[a].odds || 1) * 10) * 10), pop: F[a].pop || 1 });
    // 複勝
    const pl = order.slice(0, placeN);
    pl.forEach(i => { const r = rank(all.place, String(i)); rows.push({ t: 'place', combo: [String(U(i))], pay: yen(RATE.place, r.p * placeN), pop: r.pop }); });
    // 枠連（9頭以上のときだけ発売）
    if (n >= 9) { const wk = [waku[a], waku[b]].sort((x, y) => x - y).join('-'); const r = rank(wakuArr, wk); rows.push({ t: 'waku', combo: wk.split('-'), pay: yen(RATE.waku, r.p), pop: r.pop }); }
    // 馬連
    { const k = a < b ? `${a}-${b}` : `${b}-${a}`; const r = rank(all.quin, k); rows.push({ t: 'quin', combo: k.split('-').map(x => String(U(+x))), pay: yen(RATE.quin, r.p), pop: r.pop }); }
    // ワイド
    // ワイド（1〜3着のうち2頭の組。売上を3つの的中組で分けるので、組の確率×3 で割る）。7頭以下のレースでは表示しない
    if (placeN === 3) [[a, b], [a, c], [b, c]].forEach(([x, y]) => { const k = x < y ? `${x}-${y}` : `${y}-${x}`; const r = rank(all.wide, k); rows.push({ t: 'wide', combo: k.split('-').map(z => String(U(+z))), pay: yen(RATE.wide, r.p * 3), pop: r.pop }); });
    // 馬単
    { const r = rank(all.exa, `${a}-${b}`); rows.push({ t: 'exa', combo: [String(U(a)), String(U(b))], pay: yen(RATE.exa, r.p), pop: r.pop }); }
    if (placeN === 3) {
      // 3連複
      const k = [a, b, c].sort((x, y) => x - y).join('-'); const r = rank(all.trio, k);
      rows.push({ t: 'trio', combo: k.split('-').map(z => String(U(+z))), pay: yen(RATE.trio, r.p), pop: r.pop });
      // 3連単
      const r2 = rank(all.tri, `${a}-${b}-${c}`);
      rows.push({ t: 'tri', combo: [a, b, c].map(z => String(U(z))), pay: yen(RATE.tri, r2.p), pop: r2.pop });
    }
    return rows;
  }
  window.Payout = { compute, LABEL, RATE };
})();

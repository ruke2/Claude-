/* 検証用の「そこそこ賢い経営者」ポリシー（人間プレイヤーの代理） */
module.exports = function makePolicy(E, D) {
  /* 決算期の意思決定: 資源配分 → 株主還元 */
  function annual(S, rec) {
    const pool = E.budgetPool();
    const spend = Math.min(pool * 0.55, Math.max(0, rec.profit) * 0.8);
    const map = {};
    // 稼いでいる本部＋レベルの低い本部を優先して投資
    const segs = D.DIVISIONS.map(function (d) {
      const x = (rec.seg && rec.seg[d.id]) || { gross: 0, dividend: 0, reval: 0, impair: 0 };
      return { id: d.id, v: E.segTotal(x), lv: S.div[d.id].lv };
    }).sort(function (a, b) { return b.v - a.v; });
    if (process.env.SPREAD) {
      segs.slice(0, 3).forEach(function (x, i) { map[x.id] = spend * 0.6 * [0.45, 0.33, 0.22][i]; });
    } else {
      // 主力2本部に集中投下する
      map[segs[0].id] = spend * 0.40;
      map[segs[1].id] = spend * 0.20;
    }
    map.dx = spend * 0.15; map.hr = spend * 0.12; map.esg = spend * 0.13;
    E.allocateBudget(map);

    const eq = E.equity();
    const ratio = S.debt > eq ? 0.10 : 0.30;
    const bb = (S.pbr < 0.9 && S.cash > eq * 0.5) ? Math.min(S.cash * 0.12, eq * 0.03) : 0;
    E.payout({ ratio: ratio, buyback: bb });
  }

  const turn = function (S) {
    const eq = E.equity();
    const buffer = Math.max(eq * 0.28, 6 * E.scale());   // 運転資金として残す現金

    // 1) 応札: 期待値/所要資金 が高い順。資金余力の範囲でのみ。
    let guard = 0;
    while (S.slots > 0 && guard++ < 24) {
      const cand = S.market.map(function (d) {
        if (E.bidCheck(d)) return null;
        let ev, need;
        if (d.type === 'trade') { ev = d.volume * d.marginRate; need = d.capital; }
        else if (d.type === 'project') { ev = d.contract * d.marginRate; need = d.cost * 0.35; }
        else { ev = d.invest * d.yieldRate * 22; need = d.invest; }
        if (need > S.cash - buffer * 0.35 && d.type !== 'project') return null;
        const p = E.winScore(d, 2);
        return { d: d, s: ev / Math.max(1, d.months || 18) * p };
      }).filter(Boolean).sort(function (a, b) { return b.s - a.s; });
      if (!cand.length) break;
      E.bid(cand[0].d.id, 2);
    }

    // 2) 財務: 借入は純資産の 0.8 倍まで
    if (S.cash < buffer * 0.45 && S.debt < eq * 0.8) {
      E.borrow(Math.min(E.borrowLimit() * 0.4, eq * 0.8 - S.debt, buffer));
    }
    if (S.debt > eq * 1.0 && S.cash > buffer * 2.2) E.repay(Math.min(S.cash - buffer * 2, S.debt - eq * 0.6));

    // 3) 再投資: 余剰現金があり、かつ会社規模に見合う投資だけ
    const surplus = S.cash - buffer * 1.5;
    const divs = D.DIVISIONS.map(function (x) {
      return { id: x.id, c: E.upgradeCost(x.id), lv: S.div[x.id].lv };
    }).sort(function (a, b) { return a.lv - b.lv; });
    if (divs[0].lv < 25 && surplus > divs[0].c && eq > divs[0].c * 6) E.upgrade(divs[0].id);

    if (S.active.length >= E.capacity() - 1 && surplus > E.hireCost() && eq > E.hireCost() * 8) E.hire();

    const no = D.REGIONS.filter(function (r) { return !E.hasOffice(r.id); });
    if (no.length && surplus > E.officeCost() && eq > E.officeCost() * 12) E.openOffice(no[0].id);
  };
  turn.annual = annual;
  return turn;
};

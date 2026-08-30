/* 検証用の「そこそこ賢い経営者」ポリシー（人間プレイヤーの代理） */
module.exports = function makePolicy(E, D) {
  /* 決算期の意思決定: 資源配分 → 株主還元 */
  const CARD_SETS = {
    balanced: ['nonres', 'digital'],
    resource: ['resource', 'partner'],
    asia: ['asia', 'talent'],
    safe: ['discipline', 'green'],
  };
  /* 人事: 新卒採用・昇進・本部長任命 */
  function people(S, rec) {
    if (process.env.NOHIRE) return;
    // 新卒（幹部が薄いほど多く採る）
    const want = S.people.length < 10 ? 3 : S.people.length < 16 ? 2 : 1;
    // 幹部が薄いときは質重視、足りているときはバランス
    E.setGradPolicy(process.env.GPOL != null ? +process.env.GPOL : (S.people.length < 10 ? 2 : 1));
    const n = E.gradPlan(want);
    if (S.cash > E.gradCost(n) * 8) E.hireGrads(n);
    // 給与水準: 士気が落ちてきたら引き上げ、余裕がなければ下げる
    const payroll = (E.staffCost() + E.rosterCost()) * 12;
    if (process.env.BAND != null) { E.setPayBand(+process.env.BAND); }
    else if (S.morale < 55 && payroll < Math.max(1, rec.revenue) * 0.30 && S.payBand < 3) E.setPayBand(S.payBand + 1);
    else if (payroll > Math.max(1, rec.revenue) * 0.45 && S.payBand > 1) E.setPayBand(S.payBand - 1);
    // 本部長不在の本部に、その本部で最も統率の高い者を据える
    D.DIVISIONS.forEach(function (d) {
      if (E.divHead(d.id)) return;
      const c = E.divPeople(d.id).sort(function (a, b) { return b.lead - a.lead; })[0];
      if (c) E.appointHead(c.id);
    });
    // 昇進枠を能力順に使う
    let slots = E.promoteSlots();
    S.people.slice().sort(function (a, b) { return E.personPower(b) - E.personPower(a); })
      .forEach(function (p) {
        if (slots <= 0 || p.role >= 3) return;
        if (E.personPower(p) < 45) return;
        E.promotePerson(p.id); slots--;
      });
  }

  function annual(S, rec) {
    if (rec.needEval) E.evaluatePlan(rec);
    people(S, rec);
    // 組織形態: 事業会社が育ったらグループ経営、そうでなければカンパニー制
    if (!process.env.NOORG) {
      const companies = S.assets.filter(function (a) { return a.type === 'company' && a.pmiDone; }).length;
      const want = companies >= 2 ? 'group' : S.stage >= 2 ? 'company' : 'div';
      if (want !== S.org && !E.canSwitchOrg(want)) E.switchOrg(want);
    }
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

    if (rec.needVote) E.ceoVote();
    if (rec.needPlan) {
      const set = CARD_SETS[process.env.CARDS || 'balanced'] || CARD_SETS.balanced;
      const t = +(process.env.TIER || 1);
      E.formulatePlan({ profit: t, roe: t, invest: t }, set);
    }
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

    // M&A: 売却意向のある会社にDDをかけ、割安なものだけ相場並みで取る
    if (!process.env.NOMA) {
      const open_ = E.universeList().filter(function (t) {
        return t.owner == null && t.forSale && !E.maCheck(t, 2) && E.maPrice(t, 2) < S.cash * 0.75;
      });
      open_.forEach(function (t) {
        if (!t.dd && S.cash > E.ddCost(t) * 5) E.runDD(t.id);
      });
      const best = open_.filter(function (t) {
        return t.dd && t.hidden === 0 && E.trueProfitOf(t) / E.maPrice(t, 2) > 0.065;
      }).sort(function (x, y) {
        return E.trueProfitOf(y) / E.maPrice(y, 2) - E.trueProfitOf(x) / E.maPrice(x, 2);
      })[0];
      if (best) E.acquire(best.id, 2);
    }
    // 統合責任者の指名と、統合が済んだ会社への出向
    S.assets.forEach(function (a) {
      if (a.type !== 'company') return;
      if (!a.pmiDone) {
        if (a.pmiLeader) return;
        const c = E.hqPeople().slice().sort(function (x, y) {
          return (E.traitOf(y).pmi || 0) * 100 + y.lead - (E.traitOf(x).pmi || 0) * 100 - x.lead;
        })[0];
        if (c) E.setPMILeader(a.id, c.id);
        return;
      }
      if (process.env.NOSECOND) return;
      if (!E.postHolder(a, 'ceo') && E.hqPeople().length >= 6) {
        const c = E.hqPeople().slice().sort(function (x, y) { return y.lead - x.lead; })[0];
        if (c) E.secondTo(a.id, 'ceo', c.id);
      }
    });

    // 幹部の補充（枠に余裕があり、資金に余裕があるとき）
    if (!process.env.NOHIRE && S.people.length < 14 && surplus > E.careerCost() * 6) {
      const cand = E.careerCandidates().sort(function (a, b) { return E.personPower(b) - E.personPower(a); });
      E.hireCareer(cand[0]);
    }
    if (!process.env.NOHIRE && S.people.length < 18 && surplus > E.huntCost() * 10 && Math.random() < 0.25) {
      E.headhunt();
    }
  };
  turn.annual = annual;
  return turn;
};

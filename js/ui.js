/* =========================================================
 *  SOGO SHOSHA - view layer
 * ======================================================= */
window.UI = (function () {
  const D = window.GAME;
  const E = window.ENGINE;
  const money = E.money, signed = E.signed, pct = E.pct;

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  let tab = 'dash';

  /* ---------------- HUD ---------------- */
  function renderHud() {
    const S = E.S, eq = E.equity(), st = E.stage();
    $('#hud-company').textContent = S.company;
    $('#hud-stage').textContent = st.name;
    $('#hud-date').textContent = E.now();
    $('#hud-cash').textContent = money(S.cash);
    $('#hud-cash').className = S.cash < 0 ? 'down' : '';
    $('#hud-equity').textContent = money(eq);
    $('#hud-equity').className = eq < 0 ? 'down' : '';
    const p = S.lastProfit;
    $('#hud-profit').textContent = S.turn ? signed(p) : '—';
    $('#hud-profit').className = S.turn ? (p >= 0 ? 'up' : 'down') : '';
    $('#hud-rating').textContent = E.rating().label;

    const goal = st.goal;
    const prev = S.stage ? D.STAGES[S.stage - 1].goal : 0;
    const r = goal === Infinity ? 1 : E.clamp((eq - prev) / (goal - prev), 0, 1);
    $('#hud-bar-fill').style.width = (r * 100).toFixed(1) + '%';
    $('#hud-bar-label').textContent = goal === Infinity
      ? '世界一の座を狙う' : '次の昇格まで  ' + money(Math.max(0, goal - eq));

    // slots
    const dots = [];
    for (let i = 0; i < E.slotsMax(); i++) dots.push('<i class="' + (i < S.slots ? 'on' : '') + '"></i>');
    $('#slot-dots').innerHTML = dots.join('');
    $('#slot-label').textContent = '商談枠 ' + S.slots + '/' + E.slotsMax();
    $('#btn-next').className = 'btn-next' + (S.cash < 0 ? ' warn' : '');

    const badge = S.market.length;
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
      const old = b.querySelector('.badge'); if (old) old.remove();
      if (b.dataset.tab === 'market' && badge && S.slots > 0) {
        const s = document.createElement('span'); s.className = 'badge'; s.textContent = badge;
        b.appendChild(s);
      }
    });
  }

  /* ---------------- shared bits ---------------- */
  function arrow(cur, prev) {
    const d = (cur - prev) / prev;
    const c = d >= 0.0005 ? 'up' : d <= -0.0005 ? 'down' : 'muted';
    const s = d >= 0.0005 ? '▲' : d <= -0.0005 ? '▼' : '−';
    return '<em class="' + c + '">' + s + Math.abs(d * 100).toFixed(1) + '%</em>';
  }

  function marketCard() {
    const S = E.S;
    let h = '<div class="card"><div class="sect">商品市況（指数 100 = 平年）</div><div class="mkt">';
    D.COMM_KEYS.forEach(function (k) {
      const v = S.mk[k], p = S.mkPrev[k];
      h += '<div class="m"><div class="n">' + D.COMMODITIES[k].name + '</div>' +
        '<div class="p"><b>' + v.toFixed(1) + '</b>' + arrow(v, p) + '</div></div>';
    });
    h += '</div><div class="kv" style="margin-top:10px">' +
      '<span class="k">USD/JPY</span><span class="v">' + S.fx.toFixed(1) + ' ' + arrow(S.fx, S.fxPrev) + '</span>' +
      '<span class="k">政策金利ベース</span><span class="v">' + pct(S.rateBase, 2) + '</span>' +
      '<span class="k">当社調達金利</span><span class="v">' + pct(E.interestRate(), 2) + '</span>' +
      '</div></div>';
    return h;
  }

  function ledgerCard() {
    const S = E.S, L = S.lastLedger;
    if (!L) return '';
    const rows = [
      ['トレード損益', L.trade], ['プロジェクト損益', L.project],
      ['持分法配当・収益', L.dividend], ['保有資産評価損益', L.reval],
      ['減損損失', L.impair], ['売却損益', L.gain], ['貸倒損失', L.defaults],
      ['人件費', L.wage], ['販管費', L.sga], ['支払利息', L.interest],
    ].filter(function (r) { return Math.abs(r[1]) > 0.005; });
    let h = '<div class="card"><div class="sect">前月の損益内訳</div><div class="kv">';
    rows.forEach(function (r) {
      h += '<span class="k">' + r[0] + '</span><span class="v ' + (r[1] >= 0 ? 'up' : 'down') + '">' + signed(r[1]) + '</span>';
    });
    h += '</div><div class="row" style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line)">' +
      '<b>当月純利益</b><b class="num ' + (S.lastProfit >= 0 ? 'up' : 'down') + '" style="font-size:16px">' +
      signed(S.lastProfit) + '</b></div>';
    if (S.lastCapex > 0.005) {
      h += '<div class="row tiny muted" style="margin-top:6px">' +
        '<span>本社投資・株主還元（資本取引・損益外）</span><span class="num">-' + money(S.lastCapex) + '</span></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------------- views ---------------- */
  function viewDash() {
    const S = E.S;
    let monthlyDiv = 0;
    S.assets.forEach(function (a) { monthlyDiv += a.value * a.yieldRate * E.clamp(1 + (E.mfac(a.comms) - 1) * (a.type === 'concession' ? 1 : .35), .15, 2.2); });
    const fixed = S.staff * S.wageRate + S.offices.length * 0.5 * Math.sqrt(E.scale()) + Math.max(0, E.equity()) * 0.0006 + 0.25 + S.debt * E.interestRate() / 12;

    let h = '';
    h += '<div class="card"><div class="sect">経営指標</div><div class="kv">' +
      '<span class="k">総資産（現金＋簿価）</span><span class="v">' + money(S.cash + E.bookAssets()) + '</span>' +
      '<span class="k">有利子負債</span><span class="v">' + money(S.debt) + '</span>' +
      '<span class="k">純資産</span><span class="v gold">' + money(E.equity()) + '</span>' +
      '<span class="k">累計純利益</span><span class="v ' + (S.stats.cumProfit >= 0 ? 'up' : 'down') + '">' + signed(S.stats.cumProfit) + '</span>' +
      '<span class="k">月次ストック収益（配当）</span><span class="v up">' + money(monthlyDiv) + '</span>' +
      '<span class="k">月次固定費</span><span class="v down">-' + money(fixed) + '</span>' +
      '<span class="k">世界順位</span><span class="v">' + E.myRank() + '位 / ' + (S.rivals.length + 1) + '社</span>' +
      '</div></div>';

    h += ledgerCard();
    h += marketCard();

    h += '<div class="card"><div class="sect">営業本部</div>';
    D.DIVISIONS.forEach(function (d) {
      const dd = S.div[d.id], mf = E.mfac(d.comms);
      const need = dd.lv * 3;
      h += '<div class="divrow"><div class="ic">' + d.icon + '</div>' +
        '<div class="nm"><b>' + d.short + '</b>' +
        '<div class="tiny muted">市況 ' + (mf * 100).toFixed(0) + ' ／ ' + d.comms.map(function (c) { return D.COMMODITIES[c].name; }).join('・') + '</div>' +
        '<div class="bar g"><i style="width:' + Math.min(100, dd.exp / need * 100).toFixed(0) + '%"></i></div></div>' +
        '<div class="lv"><b>Lv.' + dd.lv + '</b></div></div>';
    });
    h += '</div>';

    h += '<div class="card"><div class="sect">社史</div>';
    if (!S.log.length) h += '<div class="empty">まだ何も起きていない</div>';
    S.log.slice(0, 24).forEach(function (l) {
      h += '<div class="logline"><span class="t">' + l.t + '</span><span class="b ' + (l.k || '') + '">' + esc(l.b) + '</span></div>';
    });
    h += '</div>';
    return h;
  }

  function dealSummary(d) {
    if (d.type === 'trade')
      return '取扱高 ' + money(d.volume) + ' ／ 口銭 ' + pct(d.marginRate) + ' ／ ' + d.months + 'ヶ月';
    if (d.type === 'project')
      return '請負 ' + money(d.contract) + ' ／ 粗利率 ' + pct(d.marginRate) + ' ／ ' + d.months + 'ヶ月';
    if (d.type === 'concession')
      return '投資 ' + money(d.invest) + ' ／ 月利回り ' + pct(d.yieldRate, 2) + ' ／ ' + d.life + 'ヶ月';
    return '投資 ' + money(d.invest) + ' ／ 月利回り ' + pct(d.yieldRate, 2) + ' ／ 成長 ' + pct(d.growth, 2) + '/月';
  }

  function viewMarket() {
    const S = E.S;
    if (!S.market.length) return '<div class="empty">現在、打診されている案件はない。<br>翌月へ進めば新しい商談が持ち込まれる。</div>';
    let h = '<div class="sect">持ち込まれている案件（' + S.market.length + '件）</div>';
    S.market.forEach(function (d) {
      const dv = D.DIV_BY_ID[d.div], rg = D.REGION_BY_ID[d.region];
      const p = E.winScore(d, 2);
      h += '<button class="deal" data-deal="' + d.id + '">' +
        '<div class="deal-h"><div class="deal-t">' + (d.big ? '💎 ' : '') + esc(d.name) + '</div>' +
        '<span class="pill t-' + d.type + '">' + D.TYPE_LABEL[d.type] + '</span></div>' +
        '<div class="deal-m"><span class="pill">' + dv.icon + ' ' + dv.short + '</span>' +
        '<span class="pill">' + rg.flag + ' ' + rg.name + (E.hasOffice(d.region) ? '（拠点有）' : '') + '</span>' +
        '<span class="pill">競合 ' + d.rivals + '社</span></div>' +
        '<div class="tiny muted" style="margin-top:7px">' + dealSummary(d) + '</div>' +
        '<div class="deal-f"><span class="muted">残り ' + d.ttl + 'ヶ月</span>' +
        '<span class="' + (p > 0.55 ? 'up' : p > 0.3 ? 'warn' : 'down') + '">標準条件で落札 ' + Math.round(p * 100) + '%</span></div>' +
        '</button>';
    });
    return h;
  }

  function viewActive() {
    const S = E.S;
    let h = '<div class="sect">進行中 ' + S.active.length + ' / ' + E.capacity() + ' 件（人員が上限を決める）</div>';
    if (!S.active.length) h += '<div class="empty">進行中の案件はない。<br>「商談」から案件を取りにいこう。</div>';
    S.active.forEach(function (a) {
      const dv = D.DIV_BY_ID[a.div];
      const r = a.prog / a.months;
      let detail, fore;
      if (a.type === 'trade') {
        const swing = E.mfac(a.comms) / a.mkAtBid;
        const est = a.volume * a.marginRate * (0.35 + 0.65 * swing) * (1 + (S.fx / a.fxAtBid - 1) * (a.region === 'jp' ? .2 : .7));
        detail = '取扱高 ' + money(a.volume) + ' ／ 運転資金 ' + money(a.capital);
        fore = '想定利益 <b class="' + (est >= 0 ? 'up' : 'down') + '">' + signed(est) + '</b>';
      } else {
        detail = '請負 ' + money(a.contract) + ' ／ 出来高 ' + money(a.wip) + (a.delays ? ' ／ 遅延' + a.delays + '回' : '');
        fore = '完成時利益 <b class="' + (a.contract - a.cost >= 0 ? 'up' : 'down') + '">' + signed(a.contract - a.cost) + '</b>';
      }
      h += '<div class="card"><div class="deal-h"><div class="deal-t">' + esc(a.name) + '</div>' +
        '<span class="pill t-' + a.type + '">' + D.TYPE_LABEL[a.type] + '</span></div>' +
        '<div class="tiny muted" style="margin-top:6px">' + dv.icon + ' ' + dv.short + ' ／ ' + detail + '</div>' +
        '<div class="bar"><i style="width:' + (r * 100).toFixed(0) + '%"></i></div>' +
        '<div class="deal-f"><span class="muted">' + a.prog + ' / ' + a.months + 'ヶ月</span><span class="small">' + fore + '</span></div>' +
        '</div>';
    });
    return h;
  }

  function viewAssets() {
    const S = E.S;
    let tot = 0, mdiv = 0;
    S.assets.forEach(function (a) {
      tot += a.value;
      mdiv += a.value * a.yieldRate * E.clamp(1 + (E.mfac(a.comms) - 1) * (a.type === 'concession' ? 1 : .35), .15, 2.2);
    });
    let h = '<div class="card"><div class="sect">投資ポートフォリオ</div><div class="kv">' +
      '<span class="k">保有件数</span><span class="v">' + S.assets.length + '件</span>' +
      '<span class="k">時価（簿価）合計</span><span class="v">' + money(tot) + '</span>' +
      '<span class="k">月次配当収入</span><span class="v up">' + money(mdiv) + '</span>' +
      '<span class="k">対純資産比</span><span class="v">' + (E.equity() > 0 ? pct(tot / E.equity()) : '—') + '</span>' +
      '</div></div>';
    if (!S.assets.length)
      return h + '<div class="empty">権益・事業投資をまだ持っていない。<br>トレードの利益をストック収益に変えることが<br>総合商社への道だ。</div>';

    S.assets.forEach(function (a) {
      const dv = D.DIV_BY_ID[a.div], rg = D.REGION_BY_ID[a.region];
      const pl = a.value - a.basis;
      const remain = a.type === 'concession' ? Math.max(0, a.life - a.age) + 'ヶ月' : '無期限';
      h += '<div class="card"><div class="deal-h"><div class="deal-t">' + esc(a.name) + '</div>' +
        '<span class="pill t-' + a.type + '">' + D.TYPE_LABEL[a.type] + '</span></div>' +
        '<div class="tiny muted" style="margin-top:6px">' + dv.icon + ' ' + dv.short + ' ／ ' + rg.flag + ' ' + rg.name + ' ／ 残存 ' + remain + '</div>' +
        '<div class="kv" style="margin-top:9px">' +
        '<span class="k">取得原価</span><span class="v">' + money(a.basis) + '</span>' +
        '<span class="k">現在価値</span><span class="v ' + (pl >= 0 ? 'up' : 'down') + '">' + money(a.value) + ' (' + signed(pl) + ')</span>' +
        '<span class="k">累計配当</span><span class="v up">' + money(a.cum) + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:9px">' +
        '<button class="act" data-sell="' + a.id + '">売却する</button></div></div>';
    });
    return h;
  }

  function viewAdmin() {
    const S = E.S, rt = E.rating();
    let h = '';

    h += '<div class="card"><div class="sect">財務</div><div class="kv">' +
      '<span class="k">現金</span><span class="v ' + (S.cash < 0 ? 'down' : '') + '">' + money(S.cash) + '</span>' +
      '<span class="k">有利子負債</span><span class="v">' + money(S.debt) + '</span>' +
      '<span class="k">追加借入枠</span><span class="v">' + money(E.borrowLimit()) + '</span>' +
      '<span class="k">調達金利（年）</span><span class="v">' + pct(E.interestRate(), 2) + '</span>' +
      '<span class="k">格付 / 信用力</span><span class="v gold">' + rt.label + ' ／ ' + S.credit.toFixed(0) + '</span>' +
      '</div>' +
      '<div class="gauge"><i style="width:' + S.credit.toFixed(0) + '%;background:linear-gradient(90deg,#8a6d2c,var(--gold))"></i></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button class="act" style="flex:1" data-act="borrow">借入する</button>' +
      '<button class="act" style="flex:1" data-act="repay">返済する</button></div></div>';

    h += '<div class="card"><div class="sect">人員</div><div class="kv">' +
      '<span class="k">社員数</span><span class="v">' + S.staff.toLocaleString('ja-JP') + '名</span>' +
      '<span class="k">月次人件費</span><span class="v down">-' + money(S.staff * S.wageRate) + '</span>' +
      '<span class="k">月間商談枠</span><span class="v">' + E.slotsMax() + '</span>' +
      '<span class="k">同時進行できる案件</span><span class="v">' + E.capacity() + '件</span>' +
      '</div><div style="margin-top:10px">' +
      '<button class="act gold" style="width:100%" data-act="hire">' +
      E.hireBlock() + '名を採用（' + money(E.hireCost()) + '）</button></div></div>';

    h += '<div class="card"><div class="sect">営業本部の育成</div>';
    D.DIVISIONS.forEach(function (d) {
      const dd = S.div[d.id], c = E.upgradeCost(d.id);
      h += '<div class="divrow"><div class="ic">' + d.icon + '</div>' +
        '<div class="nm"><b>' + d.short + '</b><div class="tiny muted">落札力 +' + (dd.lv * 4.2).toFixed(0) + 'pt</div></div>' +
        '<div class="lv"><b>Lv.' + dd.lv + '</b></div>' +
        '<button class="act" data-up="' + d.id + '"' + (S.cash < c || dd.lv >= 25 ? ' disabled' : '') + '>' +
        (dd.lv >= 25 ? 'MAX' : money(c)) + '</button></div>';
    });
    h += '</div>';

    h += '<div class="card"><div class="sect">海外拠点（' + S.offices.length + '／' + D.REGIONS.length + '）</div>' +
      '<div class="tiny muted" style="margin-bottom:8px">拠点のある地域は案件が出やすく、落札力 +10pt。</div>';
    D.REGIONS.forEach(function (r) {
      const has = E.hasOffice(r.id), c = E.officeCost();
      h += '<div class="divrow"><div class="ic">' + r.flag + '</div>' +
        '<div class="nm"><b>' + r.name + '</b><div class="tiny muted">' + (has ? '開設済' : '未進出') + '</div></div>' +
        (has ? '<span class="pill">拠点</span>'
             : '<button class="act" data-office="' + r.id + '"' + (S.cash < c ? ' disabled' : '') + '>' + money(c) + '</button>') +
        '</div>';
    });
    h += '</div>';

    h += '<div class="card"><div class="sect">通算成績</div><div class="kv">' +
      '<span class="k">落札 / 失注</span><span class="v">' + S.stats.won + ' / ' + S.stats.lost + '</span>' +
      '<span class="k">完了案件</span><span class="v">' + S.stats.done + '</span>' +
      '<span class="k">減損 / 貸倒</span><span class="v down">' + S.stats.impair + ' / ' + S.stats.defaults + '</span>' +
      '<span class="k">経過</span><span class="v">' + S.turn + 'ヶ月</span>' +
      '</div><div style="margin-top:10px"><button class="act" style="width:100%" data-act="reset">最初からやり直す</button></div></div>';
    return h;
  }

  function viewRank() {
    const S = E.S;
    let h = '<div class="card"><div class="sect">世界ランキング（純資産）</div>';
    E.ranking().forEach(function (r, i) {
      h += '<div class="rank' + (r.me ? ' me' : '') + '"><div class="no">' + (i + 1) + '</div>' +
        '<div class="nm">' + esc(r.name) + (r.me ? ' <span class="pill">自社</span>' : '') + '</div>' +
        '<div class="vl">' + money(r.eq) + '</div></div>';
    });
    h += '</div>';

    h += '<div class="card"><div class="sect">成長ステージ</div>';
    D.STAGES.forEach(function (s, i) {
      const done = i < S.stage, cur = i === S.stage;
      h += '<div class="divrow"><div class="ic">' + (done ? '✅' : cur ? '▶️' : '🔒') + '</div>' +
        '<div class="nm"><b class="' + (cur ? 'gold' : done ? '' : 'muted') + '">' + s.name + '</b>' +
        '<div class="tiny muted">' + s.title + '</div></div>' +
        '<div class="lv"><span class="small ' + (cur ? 'gold' : 'muted') + '">' +
        (s.goal === Infinity ? '—' : money(s.goal)) + '</span></div></div>';
    });
    h += '</div>';

    if (S.fyHistory.length) {
      h += '<div class="card"><div class="sect">決算履歴</div><div class="kv">';
      S.fyHistory.slice().reverse().slice(0, 12).forEach(function (f) {
        h += '<span class="k">' + f.fy + '年3月期（' + f.rating + '・' + f.rank + '位）</span>' +
          '<span class="v ' + (f.profit >= 0 ? 'up' : 'down') + '">' + signed(f.profit) + '</span>';
      });
      h += '</div></div>';
    }
    return h;
  }

  /* ---------------- render ---------------- */
  function render() {
    const map = { dash: viewDash, market: viewMarket, active: viewActive, assets: viewAssets, admin: viewAdmin, rank: viewRank };
    $('#view').innerHTML = (map[tab] || viewDash)();
    renderHud();
  }
  function setTab(t) { tab = t; $('#view').scrollTop = 0; render(); }

  /* ---------------- modal ---------------- */
  let onClose = null;
  function modal(html, keep) {
    $('#modal-box').innerHTML = html;
    $('#modal-root').hidden = false;
    if (!keep) onClose = null;
  }
  function closeModal() {
    $('#modal-root').hidden = true;
    $('#modal-box').innerHTML = '';
    const f = onClose; onClose = null;
    if (f) f();
  }

  function alertBox(title, body, kind) {
    modal('<h2 class="' + (kind || '') + '">' + title + '</h2><p>' + body + '</p>' +
      '<div class="mbtns"><button class="pri" data-close>了解</button></div>');
  }

  /* --- 商談モーダル --- */
  let curDeal = null, curStance = 2;
  function openDeal(id) {
    const d = E.S.market.find(function (x) { return x.id === id; });
    if (!d) return;
    curDeal = d; curStance = 2;
    drawDeal();
  }
  function drawDeal() {
    const d = curDeal, dv = D.DIV_BY_ID[d.div], rg = D.REGION_BY_ID[d.region];
    const err = E.bidCheck(d);
    const p = E.winScore(d, curStance);
    const st = D.STANCES[curStance];

    let terms = '';
    if (d.type === 'trade') {
      const mAdj = 1; // 入札時点基準
      const est = d.volume * d.marginRate * st.mult;
      terms = '<div class="kv">' +
        '<span class="k">取扱高</span><span class="v">' + money(d.volume) + '</span>' +
        '<span class="k">拠出する運転資金</span><span class="v down">-' + money(d.capital) + '</span>' +
        '<span class="k">口銭（提示条件後）</span><span class="v">' + pct(d.marginRate * st.mult) + '</span>' +
        '<span class="k">想定利益</span><span class="v up">' + signed(est) + '</span>' +
        '<span class="k">決済まで</span><span class="v">' + d.months + 'ヶ月</span>' +
        '<span class="k">与信リスク</span><span class="v ' + (d.risk > .025 ? 'down' : '') + '">' + pct(d.risk) + '</span>' +
        '</div>';
    } else if (d.type === 'project') {
      const c = d.contract * (0.82 + 0.18 * st.mult);
      terms = '<div class="kv">' +
        '<span class="k">請負金額（条件反映）</span><span class="v">' + money(c) + '</span>' +
        '<span class="k">前受金（即時入金）</span><span class="v up">+' + money(d.adv) + '</span>' +
        '<span class="k">総工事原価</span><span class="v down">-' + money(d.cost) + '</span>' +
        '<span class="k">完成時利益（想定）</span><span class="v up">' + signed(c - d.cost) + '</span>' +
        '<span class="k">工期</span><span class="v">' + d.months + 'ヶ月</span>' +
        '<span class="k">遅延リスク</span><span class="v">' + pct(d.risk) + '</span>' +
        '</div>';
    } else {
      const y = d.yieldRate * (0.85 + 0.15 * st.mult);
      terms = '<div class="kv">' +
        '<span class="k">投資額</span><span class="v down">-' + money(d.invest) + '</span>' +
        '<span class="k">月次配当利回り</span><span class="v up">' + pct(y, 2) + '（年 ' + pct(y * 12, 1) + '）</span>' +
        '<span class="k">初月の配当（目安）</span><span class="v up">' + money(d.invest * y) + '</span>' +
        (d.type === 'concession'
          ? '<span class="k">可採期間</span><span class="v">' + d.life + 'ヶ月</span>' +
            '<span class="k">市況感応度</span><span class="v warn">高（減損リスク有）</span>'
          : '<span class="k">投資先の成長</span><span class="v up">+' + pct(d.growth, 2) + '/月</span>' +
            '<span class="k">市況感応度</span><span class="v">低</span>') +
        '</div>';
    }

    let aggr = '<div class="aggr">';
    D.STANCES.forEach(function (s, i) {
      aggr += '<button data-stance="' + i + '" class="' + (i === curStance ? 'on' : '') + '"><b>' + s.n + '</b>×' + s.mult.toFixed(2) + '</button>';
    });
    aggr += '</div><p class="tiny" style="margin-bottom:12px">' + st.desc + '</p>';

    const col = p > 0.55 ? 'var(--up)' : p > 0.3 ? 'var(--warn)' : 'var(--down)';

    modal(
      '<h2>' + (d.big ? '💎 ' : '') + esc(d.name) + '</h2>' +
      '<p class="tiny" style="margin-bottom:12px">' +
        '<span class="pill t-' + d.type + '">' + D.TYPE_LABEL[d.type] + '</span> ' +
        '<span class="pill">' + dv.icon + ' ' + dv.name + '</span> ' +
        '<span class="pill">' + rg.flag + ' ' + rg.name + '</span> ' +
        '<span class="pill">競合 ' + d.rivals + '社</span></p>' +
      '<p class="tiny">' + D.TYPE_DESC[d.type] + '</p>' +
      '<h3>提示条件</h3>' + aggr +
      '<h3>落札確度</h3>' +
      '<div class="gauge"><i style="width:' + (p * 100).toFixed(0) + '%;background:' + col + '"></i></div>' +
      '<div class="row small"><span class="muted">' + dv.short + ' Lv.' + E.S.div[d.div].lv +
        ' ／ 格付 ' + E.rating().label + (E.hasOffice(d.region) ? ' ／ 現地拠点あり' : '') + '</span>' +
        '<b style="color:' + col + '">' + Math.round(p * 100) + '%</b></div>' +
      '<h3>条件</h3>' + terms +
      (err ? '<p class="down small" style="margin-top:12px">⚠ ' + err + '</p>' : '') +
      '<div class="mbtns"><button data-close>見送る</button>' +
      '<button class="pri" data-bid="' + d.id + '"' + (err ? ' disabled' : '') + '>この条件で応札</button></div>'
    );
  }

  function bidResult(res) {
    if (!res.ok) { alertBox('応札できない', res.msg, 'down'); return; }
    const d = res.deal;
    if (res.won) {
      alertBox('落札', '「' + esc(d.name) + '」の獲得に成功した。<br>落札確度 ' + Math.round(res.prob * 100) + '% を引き当てた。' +
        (d.type === 'trade' ? '<br>運転資金 ' + money(d.capital) + ' を拠出した。' :
         d.type === 'project' ? '<br>前受金 ' + money(d.adv) + ' が入金された。' :
         '<br>' + money(d.invest) + ' を投じ、ポートフォリオに加わった。'), 'up');
    } else {
      alertBox('失注', '「' + esc(d.name) + '」は競合に取られた。<br>落札確度は ' + Math.round(res.prob * 100) + '% だった。<br>' +
        '本部のレベルと信用力を高めれば、次は取れる。', 'down');
    }
    render();
  }

  /* --- 金額入力モーダル --- */
  function amountModal(title, desc, max, cb) {
    if (max <= 0) { alertBox(title, '実行できる金額がない。', 'down'); return; }
    let v = Math.round(max * 0.5 * 10) / 10;
    function draw() {
      modal('<h2>' + title + '</h2><p>' + desc + '</p>' +
        '<div class="row"><span class="muted small">金額</span><b class="num gold" style="font-size:22px">' + money(v) + '</b></div>' +
        '<input class="range" type="range" min="0" max="1000" value="' + Math.round(v / max * 1000) + '" id="rng">' +
        '<div class="row tiny muted"><span>0</span><span>上限 ' + money(max) + '</span></div>' +
        '<div class="mbtns"><button data-close>やめる</button><button class="pri" id="ok">実行</button></div>', true);
      $('#rng').addEventListener('input', function (e) {
        v = max * (e.target.value / 1000);
        $('.modal .num').textContent = money(v);
      });
      $('#ok').addEventListener('click', function () { closeModal(); cb(v); render(); });
    }
    draw();
  }

  /* --- イベント / 決算 / 昇格 --- */
  function eventModal(e, after) {
    onClose = after;
    modal('<div class="evt-ic">' + e.ic + '</div><h2 style="text-align:center">' + e.title + '</h2>' +
      '<p style="margin-top:10px">' + e.text + '</p>' +
      '<div class="mbtns"><button class="pri" data-close>受け止める</button></div>', true);
  }

  function fyModal(f, after) {
    const S = E.S;
    const grow = f.eqStart > 0 ? (f.eqEnd / f.eqStart - 1) : 0;
    onClose = null;
    modal('<h2>' + f.fy + '年3月期 決算</h2>' +
      '<p class="tiny">通期の成績が確定した。株主還元の方針を決めよ。</p>' +
      '<div class="fy-grid">' +
      '<div class="b"><label>通期純利益</label><b class="' + (f.profit >= 0 ? 'up' : 'down') + '">' + signed(f.profit) + '</b></div>' +
      '<div class="b"><label>純資産</label><b class="gold">' + money(f.eqEnd) + '</b></div>' +
      '<div class="b"><label>純資産成長率</label><b class="' + (grow >= 0 ? 'up' : 'down') + '">' + pct(grow) + '</b></div>' +
      '<div class="b"><label>格付 / 世界順位</label><b>' + f.rating + ' ／ ' + f.rank + '位</b></div>' +
      '<div class="b"><label>完了案件</label><b>' + f.deals + '件</b></div>' +
      '<div class="b"><label>社員数</label><b>' + S.staff.toLocaleString('ja-JP') + '</b></div>' +
      '</div>' +
      '<h3>株主還元</h3>' +
      '<div class="mbtns" style="flex-direction:column;gap:8px">' +
      '<button data-payout="high">増配（純資産の3.5%を配当・信用+9）</button>' +
      '<button class="pri" data-payout="normal">標準配当（1.5%・信用+5）</button>' +
      '<button data-payout="none">無配（内部留保優先・信用-3）</button>' +
      '</div>', true);
  }

  function promoteModal(st, after) {
    onClose = after;
    modal('<div class="evt-ic">🎖️</div>' +
      '<h2 style="text-align:center" class="gold">' + st.name + ' へ昇格</h2>' +
      '<p style="text-align:center;margin-top:10px">' + st.title + '<br><br>' +
      '取り扱える案件の規模が跳ね上がった。<br>より大きな資金と、より大きなリスクの世界へ。</p>' +
      '<div class="mbtns"><button class="pri" data-close>次の段階へ</button></div>', true);
  }

  function endModal(win) {
    const S = E.S;
    onClose = null;
    modal('<div class="evt-ic">' + (win ? '👑' : '💀') + '</div>' +
      '<h2 style="text-align:center">' + (win ? '世界最大の総合商社' : '経営破綻') + '</h2>' +
      '<p style="text-align:center;margin-top:8px">' +
      (win ? esc(S.company) + ' は世界の頂点に立った。<br>ラーメンから航空機まで、地球上のあらゆる商いが<br>この会社を通っている。'
           : esc(S.company) + ' は債務超過に陥り、<br>再建を断念した。') + '</p>' +
      '<div class="fy-grid">' +
      '<div class="b"><label>最終純資産</label><b class="gold">' + money(E.equity()) + '</b></div>' +
      '<div class="b"><label>経過</label><b>' + Math.floor(S.turn / 12) + '年' + (S.turn % 12) + 'ヶ月</b></div>' +
      '<div class="b"><label>累計純利益</label><b>' + signed(S.stats.cumProfit) + '</b></div>' +
      '<div class="b"><label>世界順位</label><b>' + E.myRank() + '位</b></div>' +
      '</div>' +
      '<div class="mbtns"><button class="pri" data-act="reset">新たな会社を興す</button></div>', true);
  }

  return {
    render: render, setTab: setTab, get tab() { return tab; },
    modal: modal, closeModal: closeModal, alertBox: alertBox,
    openDeal: openDeal, drawDeal: drawDeal, bidResult: bidResult,
    amountModal: amountModal, eventModal: eventModal, fyModal: fyModal,
    promoteModal: promoteModal, endModal: endModal,
    setStance: function (i) { curStance = i; drawDeal(); },
    esc: esc,
  };
})();

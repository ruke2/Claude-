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

    const price = E.sharePrice(), dp = S.pbrPrev ? (S.pbr / S.pbrPrev - 1) : 0;
    $('#hud-mkt').innerHTML =
      '株価 <b>' + (price >= 10000 ? Math.round(price).toLocaleString('ja-JP') : price.toFixed(price < 100 ? 1 : 0)) + '円</b>' +
      '<em class="' + (dp >= 0 ? 'up' : 'down') + '" style="font-style:normal">' +
        (dp >= 0 ? '▲' : '▼') + Math.abs(dp * 100).toFixed(1) + '%</em>' +
      '<span class="sep">|</span>PBR <b class="' + (S.pbr < 1 ? 'down' : '') + '">' + S.pbr.toFixed(2) + '</b>' +
      '<span class="sep">|</span>ROE <b class="' + (S.roeTTM >= 0 ? 'up' : 'down') + '">' + pct(S.roeTTM, 1) + '</b>' +
      '<span class="sep">|</span>信任 <b>' + Math.round(S.trust) + '</b>';

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
    let h = '<div class="card"><div class="sect">前月の損益内訳</div>' +
      '<div class="kv" style="margin-bottom:9px;padding-bottom:9px;border-bottom:1px solid var(--line)">' +
      '<span class="k">取扱高</span><span class="v gold">' + money(S.mGTV || 0) + '</span>' +
      '<span class="k">収益 − 費用</span><span class="v">' + money(S.mRev || 0) + ' − ' + money(S.mCost || 0) + '</span>' +
      '</div><div class="kv">';
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
    const fixed = E.staffCost() + E.rosterCost() + S.offices.length * 0.5 * Math.sqrt(E.scale()) + Math.max(0, E.equity()) * 0.0006 + 0.25 + S.debt * E.interestRate() / 12;

    let h = '';
    h += planCard();
    h += '<div class="card"><div class="sect">経営指標</div><div class="kv">' +
      '<span class="k">総資産（現金＋簿価）</span><span class="v">' + money(S.cash + E.bookAssets()) + '</span>' +
      '<span class="k">有利子負債</span><span class="v">' + money(S.debt) + '</span>' +
      '<span class="k">純資産</span><span class="v gold">' + money(E.equity()) + '</span>' +
      '<span class="k">累計純利益</span><span class="v ' + (S.stats.cumProfit >= 0 ? 'up' : 'down') + '">' + signed(S.stats.cumProfit) + '</span>' +
      '<span class="k">月次ストック収益（配当）</span><span class="v up">' + money(monthlyDiv) + '</span>' +
      '<span class="k">月次固定費</span><span class="v down">-' + money(fixed) + '</span>' +
      '<span class="k">世界順位</span><span class="v">' + E.myRank() + '位 / ' + (S.rivals.length + 1) + '社</span>' +
      '</div><div class="kv" style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line)">' +
      '<span class="k">当期の取扱高（' + E.monthsInFY() + 'ヶ月累計）</span><span class="v gold">' + money(S.fy.gtv || 0) + '</span>' +
      '<span class="k">当期の収益</span><span class="v">' + money(S.fy.revenue || 0) + '</span>' +
      '<span class="k">当期の費用</span><span class="v down">-' + money(S.fy.cost || 0) + '</span>' +
      '<span class="k">当期純利益</span><span class="v ' + (S.fy.profit >= 0 ? 'up' : 'down') + '">' + signed(S.fy.profit || 0) + '</span>' +
      '</div></div>';

    h += ledgerCard();

    // 株式市場
    h += '<div class="card"><div class="sect">株式市場</div><div class="kv">' +
      '<span class="k">株価</span><span class="v">' + Math.round(E.sharePrice()).toLocaleString('ja-JP') + ' 円</span>' +
      '<span class="k">時価総額</span><span class="v">' + money(E.mcap()) + '</span>' +
      '<span class="k">PBR</span><span class="v ' + (S.pbr < 1 ? 'down' : 'up') + '">' + S.pbr.toFixed(2) + ' 倍</span>' +
      '<span class="k">1株当たり純資産</span><span class="v">' + Math.round(E.bps()).toLocaleString('ja-JP') + ' 円</span>' +
      '<span class="k">ROE（直近12ヶ月）</span><span class="v ' + (S.roeTTM >= 0.08 ? 'up' : S.roeTTM < 0 ? 'down' : '') + '">' + pct(S.roeTTM) + '</span>' +
      '<span class="k">株主信任</span><span class="v">' + Math.round(S.trust) + ' / 100</span>' +
      '</div>' +
      (S.pbr < 1 ? '<p class="tiny down" style="margin:9px 0 0">⚠ PBR 1倍割れ。市場は当社の純資産を額面以下に評価している。資本効率の改善が求められる。</p>' : '') +
      '</div>';

    // セグメント別損益（当期累計）
    h += segCard();
    h += budgetCard();
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

  /* ---------- 年次チャート（1系列・棒） ----------
     収益は単色、純利益は同一色相で「上向き＝黒字／下向き（ハッチ）＝赤字」と
     符号付きラベルで示す。色だけに意味を持たせない。 */
  function fyBars(rows, key, color, title, hatchNeg) {
    if (!rows.length) return '';
    const W = 320, H = 96, PAD_B = 15, PAD_T = 8;
    const vals = rows.map(function (r) { return r[key] || 0; });
    const mx = Math.max(0, Math.max.apply(null, vals));
    const mn = Math.min(0, Math.min.apply(null, vals));
    const span = (mx - mn) || 1;
    const plotH = H - PAD_B - PAD_T;
    const zeroY = PAD_T + (mx / span) * plotH;
    const gap = 2;
    const bw = Math.min(36, Math.max(3, (W - gap * (rows.length - 1)) / rows.length - gap));
    const step = rows.length > 1 ? Math.min((W - bw) / (rows.length - 1), bw + gap * 3) : 0;
    const hid = 'h' + key;
    let bars = '', labels = '';
    rows.forEach(function (r, i) {
      const v = r[key] || 0;
      const x0 = (W - (step * (rows.length - 1) + bw)) / 2;
      const x = x0 + i * step;
      const hgt = Math.max(1.5, Math.abs(v) / span * plotH);
      const y = v >= 0 ? zeroY - hgt : zeroY;
      const rr = Math.min(4, bw / 2, hgt);
      // 底辺は角を立て、データ端だけ丸める
      const p = v >= 0
        ? 'M' + x + ',' + (y + hgt) + 'V' + (y + rr) + 'q0,-' + rr + ' ' + rr + ',-' + rr +
          'h' + (bw - rr * 2) + 'q' + rr + ',0 ' + rr + ',' + rr + 'V' + (y + hgt) + 'Z'
        : 'M' + x + ',' + y + 'V' + (y + hgt - rr) + 'q0,' + rr + ' ' + rr + ',' + rr +
          'h' + (bw - rr * 2) + 'q' + rr + ',0 ' + rr + ',-' + rr + 'V' + y + 'Z';
      const fill = (hatchNeg && v < 0) ? 'url(#' + hid + ')' : color;
      bars += '<path d="' + p + '" fill="' + fill + '"' + (v < 0 && hatchNeg ? ' stroke="' + color + '" stroke-width="1"' : '') + '>' +
        '<title>' + r.fy + '年3月期  ' + signed(v) + '</title></path>';
      if (rows.length <= 8 || i % 2 === 0 || i === rows.length - 1) {
        labels += '<text class="cx" x="' + (x + bw / 2) + '" y="' + (H - 3) + '" text-anchor="middle">' +
          ("'" + String(r.fy).slice(2)) + '</text>';
      }
    });
    const last = rows[rows.length - 1][key] || 0;
    return '<div class="chart"><div class="ct"><span>' + title + '</span>' +
      '<b class="' + (last >= 0 ? '' : 'down') + '">' + rows[rows.length - 1].fy + '/3期 ' + signed(last) + '</b></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + title + 'の年次推移">' +
      (hatchNeg ? '<defs><pattern id="' + hid + '" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect width="5" height="5" fill="' + color + '" opacity="0.28"/>' +
        '<line x1="0" y1="0" x2="0" y2="5" stroke="' + color + '" stroke-width="2.2"/></pattern></defs>' : '') +
      '<line class="cz" x1="0" y1="' + zeroY + '" x2="' + W + '" y2="' + zeroY + '"/>' +
      bars + labels + '</svg></div>';
  }

  /* ---------- 人材 ---------- */
  function abBar(label, v, cls) {
    return '<span class="l">' + label + '</span>' +
      '<span class="g ' + cls + '"><i style="width:' + v + '%"></i></span>' +
      '<span class="v">' + v + '</span>';
  }
  function personCard(p, attr) {
    const dv = D.DIV_BY_ID[p.div], t = E.traitOf(p), isHead = p.role >= 3;
    const where = p.region ? D.REGION_BY_ID[p.region].flag + ' ' + D.REGION_BY_ID[p.region].name + '駐在' : '本社';
    return '<' + (attr ? 'button' : 'div') + ' class="pcard' + (isHead ? ' head' : '') + '"' +
      (attr ? ' ' + attr : '') + '>' +
      '<div class="ph"><div class="fc">' + p.face + '</div>' +
      '<div class="id"><b>' + esc(p.name) + '<span class="muted" style="font-weight:400;font-size:11px"> ' + p.age + '</span></b>' +
      '<div class="sub">' + dv.icon + ' ' + dv.short + ' ／ ' + where + '</div></div>' +
      '<div class="rl"><span class="r' + (isHead ? ' h' : '') + '">' + D.ROLES[p.role] + '</span></div></div>' +
      '<div class="abs">' + abBar('営業', p.sales, 's') + abBar('目利', p.eye, 'e') + abBar('統率', p.lead, 'd') + '</div>' +
      (t.id !== 'none' ? '<div class="trait">◆ ' + t.name + '<span>' + t.desc + '</span></div>' : '') +
      '</' + (attr ? 'button' : 'div') + '>';
  }

  /* 中期経営計画の進捗 */
  function planCard() {
    const S = E.S, p = E.planProgress();
    if (!p) {
      return S.planNo ? '' :
        '<div class="card quiet" style="background:var(--card2)"><div class="sect">中期経営計画</div>' +
        '<p class="tiny muted" style="margin:0">最初の決算（3月）で第1次中期経営計画を策定する。' +
        '3年分の数値目標と重点戦略を、自分で選んで背負うことになる。</p></div>';
    }
    function bar(cur, target, label, fmt) {
      const r = target > 0 ? E.clamp(cur / target, 0, 1) : 0;
      const ok = cur >= target;
      return '<div style="margin-bottom:11px"><div class="row small"><span class="muted">' + label + '</span>' +
        '<span class="num ' + (ok ? 'up' : '') + '">' + fmt(cur) + ' <span class="muted">/ ' + fmt(target) + '</span></span></div>' +
        '<div class="bar ' + (ok ? 'g' : '') + '"><i style="width:' + (r * 100).toFixed(0) + '%"></i></div></div>';
    }
    let h = '<div class="card"><div class="sect">第' + p.no + '次中期経営計画</div>' +
      '<div class="row" style="margin-bottom:11px"><span class="small muted">' + p.endFY + '年3月期まで</span>' +
      '<b class="gold">残り ' + p.yearsLeft + '年度</b></div>' +
      bar(p.profit.cur, p.profit.target, '今期 純利益', money) +
      bar(p.roe.cur, p.roe.target, 'ROE（直近12ヶ月）', function (v) { return pct(v); }) +
      bar(p.invest.cur, p.invest.target, '3年累計 投資額', money) +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">';
    p.cards.forEach(function (cid) {
      const c = D.CARD_BY_ID[cid];
      if (c) h += '<span class="pill" style="color:var(--gold2);border-color:var(--gold-line,#7d6229)">' + c.icon + ' ' + c.name + '</span>';
    });
    h += '</div></div>';
    return h;
  }

  /* 当期のセグメント別損益 */
  function segCard() {
    const S = E.S;
    if (!S.seg) return '';
    let any = false;
    D.DIVISIONS.forEach(function (d) { if (Math.abs(E.segTotal(S.seg[d.id] || {gross:0,dividend:0,reval:0,impair:0})) > 0.005) any = true; });
    if (!any) return '';
    let h = '<div class="card"><div class="sect">セグメント別損益（当期累計）</div>' +
      '<table class="seg-t"><thead><tr><th>本部</th><th>商い</th><th>配当</th><th>評価・減損</th><th>計</th></tr></thead><tbody>';
    let tot = 0;
    D.DIVISIONS.forEach(function (d) {
      const x = S.seg[d.id] || { gross: 0, dividend: 0, reval: 0, impair: 0 };
      const t = E.segTotal(x); tot += t;
      h += '<tr><td>' + d.icon + ' ' + d.short + '</td>' +
        '<td>' + (Math.abs(x.gross) > .005 ? signed(x.gross) : '—') + '</td>' +
        '<td>' + (Math.abs(x.dividend) > .005 ? signed(x.dividend) : '—') + '</td>' +
        '<td class="' + (x.reval + x.impair < 0 ? 'down' : '') + '">' + (Math.abs(x.reval + x.impair) > .005 ? signed(x.reval + x.impair) : '—') + '</td>' +
        '<td class="' + (Math.abs(t) < .005 ? 'muted' : t >= 0 ? 'up' : 'down') + '"><b>' +
          (Math.abs(t) < .005 ? '—' : signed(t)) + '</b></td></tr>';
    });
    const corp = (S.fy.wage || 0) + (S.fy.sga || 0) + (S.fy.interest || 0) + (S.fy.gain || 0);
    h += '<tr class="corp"><td>全社費用</td><td colspan="3" style="text-align:left;font-size:10px" class="muted">人件費・販管費・支払利息ほか</td>' +
      '<td class="down">' + signed(corp) + '</td></tr>' +
      '<tr class="tot"><td>当期純利益</td><td colspan="3"></td><td class="' + (tot + corp >= 0 ? 'up' : 'down') + '">' + signed(tot + corp) + '</td></tr>' +
      '</tbody></table></div>';
    return h;
  }

  /* 予算配分の効き */
  function budgetCard() {
    const S = E.S;
    const anyB = D.DIVISIONS.some(function (d) { return E.boostOf(d.id) > 0.01; });
    const anyC = D.BUDGET_CORP.some(function (c) { return E.corpOf(c.id) > 0.01; });
    if (!anyB && !anyC) return '';
    let h = '<div class="card"><div class="sect">今年度予算の効き</div>';
    D.DIVISIONS.forEach(function (d) {
      const b = E.boostOf(d.id);
      if (b <= 0.01) return;
      h += '<div class="divrow"><div class="ic">' + d.icon + '</div>' +
        '<div class="nm"><b>' + d.short + '</b><div class="tiny muted">落札力 +' + (b * 8).toFixed(0) + 'pt ／ 案件規模 +' + pct(b * 0.20, 0) + ' ／ 採算 +' + pct(b * 0.10, 0) + '</div>' +
        '<div class="bar g"><i style="width:' + Math.min(100, b / 3 * 100).toFixed(0) + '%"></i></div></div>' +
        '<div class="lv"><b>×' + b.toFixed(1) + '</b></div></div>';
    });
    D.BUDGET_CORP.forEach(function (c) {
      const v = E.corpOf(c.id);
      if (v <= 0.01) return;
      h += '<div class="divrow"><div class="ic">' + c.icon + '</div>' +
        '<div class="nm"><b>' + c.name + '</b><div class="tiny muted">' + c.desc + '</div></div>' +
        '<div class="lv"><b>' + v.toFixed(1) + '</b></div></div>';
    });
    h += '<p class="tiny muted" style="margin:9px 0 0">本部予算は1年で切れる。コーポレート投資は蓄積するが毎年14%ずつ目減りする。</p></div>';
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
    let h = '';
    if (S.ma && S.ma.length) {
      h += '<div class="sect">M&amp;A 候補（' + S.ma.length + '社）</div>';
      S.ma.forEach(function (t) {
        const dv = D.DIV_BY_ID[t.div], rg = D.REGION_BY_ID[t.region];
        h += '<button class="deal" data-ma="' + t.id + '" style="border-color:#5a3f86">' +
          '<div class="deal-h"><div class="deal-t">🏢 ' + esc(t.name) + '</div>' +
          '<span class="pill t-concession">' + (t.listed ? '上場' : '非上場') + '</span></div>' +
          '<div class="deal-m"><span class="pill">' + dv.icon + ' ' + dv.short + '</span>' +
          '<span class="pill">' + rg.flag + ' ' + rg.name + '</span>' +
          '<span class="pill">競合 ' + t.rivals + '社</span>' +
          (t.dd ? '<span class="pill" style="color:var(--up);border-color:#2f6b4c">DD済</span>'
                : '<span class="pill" style="color:var(--warn);border-color:#7a5628">DD未実施</span>') + '</div>' +
          '<div class="tiny muted" style="margin-top:7px">純資産 ' + money(t.netAssets) +
            ' ／ ' + (t.dd ? '実力純利益 ' + money(t.trueProfit) + '/年' : '表面純利益 ' + money(t.shownProfit) + '/年') + '</div>' +
          '<div class="deal-f"><span class="muted">残り ' + t.ttl + 'ヶ月</span>' +
          '<span class="gold">想定 ' + money(E.maPrice(t, 2)) + '</span></div></button>';
      });
      h += '<div style="height:6px"></div>';
    }
    if (!S.market.length) return h + '<div class="empty">現在、打診されている案件はない。<br>翌月へ進めば新しい商談が持ち込まれる。</div>';
    h += '<div class="sect">持ち込まれている案件（' + S.market.length + '件）</div>';
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
      if (a.type === 'company') {
        const leader = a.pmiLeader ? E.findPerson(a.pmiLeader) : null;
        h += '<div class="card"><div class="deal-h"><div class="deal-t">🏢 ' + esc(a.name) + '</div>' +
          '<span class="pill ' + (a.pmiDone ? 't-investment' : 't-project') + '">' +
          (a.pmiDone ? '稼働' : '統合中') + '</span></div>' +
          '<div class="tiny muted" style="margin-top:6px">' + dv.icon + ' ' + dv.short + ' ／ ' + rg.flag + ' ' + rg.name + '</div>';
        if (!a.pmiDone) {
          const pc = E.pmiChance(a);
          h += '<div class="bar"><i style="width:' + ((12 - a.pmiLeft) / 12 * 100).toFixed(0) + '%"></i></div>' +
            '<div class="deal-f"><span class="muted">統合まで残り ' + a.pmiLeft + 'ヶ月</span>' +
            '<span class="' + (pc > 0.6 ? 'up' : pc > 0.4 ? 'warn' : 'down') + '">成功確度 ' + Math.round(pc * 100) + '%</span></div>' +
            '<div class="row small" style="margin-top:8px"><span class="muted">統合責任者</span>' +
            '<span>' + (leader ? leader.face + ' ' + esc(leader.name) + '（統率 ' + leader.lead + '）' : '<span class="down">未指名</span>') + '</span></div>' +
            '<button class="act" style="width:100%;margin-top:8px" data-pmi="' + a.id + '">統合責任者を指名する</button>';
        } else {
          h += '<div class="kv" style="margin-top:9px">' +
            '<span class="k">取得原価 / うち のれん</span><span class="v">' + money(a.basis) + ' / ' + money(a.goodwill) + '</span>' +
            '<span class="k">現在価値</span><span class="v ' + (pl >= 0 ? 'up' : 'down') + '">' + money(a.value) + ' (' + signed(pl) + ')</span>' +
            '<span class="k">シナジー</span><span class="v ' + (a.synergy > 0.5 ? 'up' : 'down') + '">×' + (1 + a.synergy * 0.55).toFixed(2) + '</span>' +
            '<span class="k">累計収益</span><span class="v up">' + money(a.cum) + '</span></div>' +
            '<div style="display:flex;justify-content:flex-end;margin-top:9px">' +
            '<button class="act" data-exit="' + a.id + '">売却（EXIT）</button></div>';
        }
        h += '</div>';
        return;
      }
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

  let adminSub = 'fin';
  function setAdminSub(v) { adminSub = v; render(); }

  function viewAdmin() {
    let h = '<div class="subtabs">' +
      '<button data-sub="fin" class="' + (adminSub === 'fin' ? 'on' : '') + '">財務・組織</button>' +
      '<button data-sub="hr" class="' + (adminSub === 'hr' ? 'on' : '') + '">人事（' + E.S.people.length + '）</button>' +
      '</div>';
    return h + (adminSub === 'hr' ? viewHR() : viewFin());
  }

  function payBandPicker() {
    const S = E.S;
    let h = '<div class="band">';
    D.PAY_BANDS.forEach(function (b, i) {
      h += '<button data-band="' + i + '" class="' + (i === S.payBand ? 'on' : '') + '">' +
        '<b>' + b.n.replace('業界', '') + '</b>×' + b.k.toFixed(2) + '</button>';
    });
    h += '</div><p class="tiny muted">' + E.payBand().desc + '</p>';
    return h;
  }
  function payTable() {
    const S = E.S;
    let h = '<table class="paytbl"><thead><tr><th>階級</th><th>人数</th><th>年収</th></tr></thead><tbody>';
    D.ROLES.forEach(function (rn, i) {
      const ps = S.people.filter(function (p) { return p.role === i; });
      const sal = ps.length
        ? (ps.length === 1 ? E.salaryOf(ps[0]).toLocaleString('ja-JP')
           : Math.min.apply(null, ps.map(E.salaryOf)).toLocaleString('ja-JP') + '〜' +
             Math.max.apply(null, ps.map(E.salaryOf)).toLocaleString('ja-JP'))
        : Math.round(D.ROLE_SALARY[i] * E.payBand().k * E.sizeFactor() / 10) * 10;
      h += '<tr class="' + (ps.length ? '' : 'none') + '"><td>' + rn + '</td><td>' + (ps.length || '—') + '</td>' +
        '<td>' + (typeof sal === 'number' ? sal.toLocaleString('ja-JP') : sal) + '<span class="tiny muted"> 万</span></td></tr>';
    });
    h += '<tr><td>一般社員（平均）</td><td>' + S.staff.toLocaleString('ja-JP') + '</td><td>' +
      E.avgStaffSalary().toLocaleString('ja-JP') + '<span class="tiny muted"> 万</span></td></tr>' +
      '</tbody></table>';
    return h;
  }

  function viewHR() {
    const S = E.S;
    let h = '<div class="card"><div class="sect">組織の状態</div><div class="kv">' +
      '<span class="k">幹部社員</span><span class="v">' + S.people.length + ' / ' + E.rosterMax() + '名</span>' +
      '<span class="k">月次の幹部人件費</span><span class="v down">-' + money(E.rosterCost()) + '</span>' +
      '<span class="k">士気</span><span class="v ' + (S.morale >= 65 ? 'up' : S.morale < 45 ? 'down' : '') + '">' + Math.round(S.morale) + ' / 100</span>' +
      '<span class="k">4年後に育つ新卒</span><span class="v">' +
        (S.gradQueue.length ? S.gradQueue.reduce(function (a, q) { return a + q.n; }, 0).toLocaleString('ja-JP') + '名' : '—') + '</span>' +
      '</div>' +
      '<div class="gauge"><i style="width:' + Math.round(S.morale) + '%;background:' +
        (S.morale >= 65 ? 'var(--up)' : S.morale < 45 ? 'var(--down)' : 'var(--warn)') + '"></i></div>' +
      '<p class="tiny muted" style="margin:8px 0 0">士気が低いと幹部が引き抜かれ、落札力も落ちる。業績・株主信任・人材投資・給与水準で上がる。</p>' +
      '<div style="display:flex;gap:8px;margin-top:11px">' +
      '<button class="act" style="flex:1" data-act="career">📄 キャリア採用（' + money(E.careerCost()) + '）</button>' +
      '<button class="act" style="flex:1" data-act="hunt">🎯 ヘッドハント（' + money(E.huntCost()) + '）</button>' +
      '</div></div>';

    h += '<div class="card"><div class="sect">給与体系</div>' +
      '<div class="kv">' +
      '<span class="k">月次の総人件費</span><span class="v down">-' + money(E.staffCost() + E.rosterCost()) + '</span>' +
      '<span class="k">　うち一般社員</span><span class="v">-' + money(E.staffCost()) + '</span>' +
      '<span class="k">　うち幹部</span><span class="v">-' + money(E.rosterCost()) + '</span>' +
      '<span class="k">新卒の内定承諾率</span><span class="v ' + (E.gradAccept() > 0.85 ? 'up' : E.gradAccept() < 0.6 ? 'down' : '') + '">' + pct(E.gradAccept(), 0) + '</span>' +
      '</div>' +
      '<h3 style="margin:14px 0 0">給与水準</h3>' + payBandPicker() + payTable() +
      '<p class="tiny muted" style="margin:9px 0 0">年収は階級・給与水準・会社規模（現在 ×' + E.sizeFactor().toFixed(2) + '）・本人の能力で決まる。' +
      '水準を上げると士気・定着・採用力が上がり、下げると優秀な人間から順に辞めていく。</p></div>';

    h += '<div class="sect">本部別の陣容</div>';
    D.DIVISIONS.forEach(function (d) {
      const ps = E.divPeople(d.id).sort(function (a, b) { return b.role - a.role || E.personPower(b) - E.personPower(a); });
      const pt = E.divSalesPt(d.id), ex = E.divExec(d.id);
      h += '<div class="card" style="padding-bottom:6px"><div class="row" style="margin-bottom:9px">' +
        '<b>' + d.icon + ' ' + d.name + '</b>' +
        '<span class="small ' + (pt >= 0 ? 'up' : 'down') + '">落札力 ' + (pt >= 0 ? '+' : '') + pt.toFixed(0) + 'pt ／ 実現利益 ×' + ex.toFixed(2) + '</span></div>';
      if (!ps.length) h += '<p class="tiny down" style="margin:0 0 10px">⚠ 誰も配属されていない。この本部はまともに戦えない。</p>';
      ps.forEach(function (p) { h += personCard(p, 'data-person="' + p.id + '"'); });
      h += '</div>';
    });

    if (S.peopleNews.length) {
      h += '<div class="card"><div class="sect">人事の動き</div>';
      S.peopleNews.slice(0, 18).forEach(function (n) {
        h += '<div class="pnews"><span class="t">' + n.t + '</span><span class="f">' + (n.f || '·') + '</span>' +
          '<span class="' + (n.k || '') + '">' + esc(n.b) + '</span></div>';
      });
      h += '</div>';
    }
    return h;
  }

  function viewFin() {
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
      '<span class="k">一般社員の平均年収</span><span class="v">' + E.avgStaffSalary().toLocaleString('ja-JP') + '万円</span>' +
      '<span class="k">月次人件費（総額）</span><span class="v down">-' + money(E.staffCost() + E.rosterCost()) + '</span>' +
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

    h += '<div class="card"><div class="sect">組織形態</div>';
    D.ORGS.forEach(function (o) {
      const cur = S.org === o.id, err = E.canSwitchOrg(o.id);
      h += '<div class="divrow"><div class="ic">' + o.icon + '</div>' +
        '<div class="nm"><b class="' + (cur ? 'gold' : S.stage < o.minStage ? 'muted' : '') + '">' + o.name + '</b>' +
        '<div class="tiny up">＋ ' + o.good + '</div>' +
        '<div class="tiny down">− ' + o.bad + '</div></div>' +
        (cur ? '<span class="pill" style="color:var(--gold2);border-color:var(--gold)">現体制</span>'
             : '<button class="act" data-org="' + o.id + '"' + (err ? ' disabled' : '') + '>' +
               (S.stage < o.minStage ? '🔒' : money(E.orgSwitchCost())) + '</button>') +
        '</div>';
    });
    h += '<p class="tiny muted" style="margin:9px 0 0">移行には純資産の3.5%と、士気の一時的な低下を伴う。前回移行から3年は動かせない。</p></div>';

    h += '<div class="card"><div class="sect">ガバナンスと信任</div><div class="kv">' +
      '<span class="k">ガバナンス</span><span class="v ' + (S.gov >= 70 ? 'up' : S.gov < 50 ? 'down' : 'warn') + '">' + Math.round(S.gov) + ' / 100</span>' +
      '<span class="k">今期の不祥事</span><span class="v ' + (S.scandals ? 'down' : '') + '">' + S.scandals + '件</span>' +
      '<span class="k">社長信任スコア</span><span class="v ' + (E.confidenceScore() >= 40 ? 'up' : 'down') + '">' + Math.round(E.confidenceScore()) + ' / 100</span>' +
      '<span class="k">次の信任投票</span><span class="v">' + (S.ceoFY + D.CONFIDENCE_EVERY) + '年3月期</span>' +
      '<span class="k">任期</span><span class="v">' + (S.ceoTerms + 1) + '期目</span>' +
      '</div>' +
      '<div class="gauge"><i style="width:' + Math.round(S.gov) + '%;background:' +
      (S.gov >= 70 ? 'var(--up)' : S.gov < 50 ? 'var(--down)' : 'var(--warn)') + '"></i></div>' +
      '<p class="tiny muted" style="margin:8px 0 0">ガバナンスが低いほど不祥事が起きやすい。サステナ・内部統制への予算配分で回復し、' +
      'カンパニー制・グループ経営・高レバレッジ・幹部不足で低下する。' +
      '<strong>信任スコアが40を切ると解任される。</strong></p></div>';

    if (E.autonomyIncome() > 0) {
      h += '<div class="card quiet"><div class="row"><span class="small muted">カンパニー制の自律収益（月次）</span>' +
        '<b class="up num">' + money(E.autonomyIncome()) + '</b></div></div>';
    }

    h += '<div class="card"><div class="sect">通算成績</div><div class="kv">' +
      '<span class="k">落札 / 失注</span><span class="v">' + S.stats.won + ' / ' + S.stats.lost + '</span>' +
      '<span class="k">完了案件</span><span class="v">' + S.stats.done + '</span>' +
      '<span class="k">減損 / 貸倒</span><span class="v down">' + S.stats.impair + ' / ' + S.stats.defaults + '</span>' +
      '<span class="k">M&amp;A（成功/失敗/売却）</span><span class="v">' + S.maStats.done + ' (' + S.maStats.pmiOk + '/' + S.maStats.pmiNg + '/' + S.maStats.exits + ')</span>' +
      '<span class="k">経過</span><span class="v">' + S.turn + 'ヶ月</span>' +
      '</div><div style="margin-top:10px"><button class="act" style="width:100%" data-act="reset">最初からやり直す</button></div></div>';
    return h;
  }

  /* 幹部の操作モーダル */
  function personModal(id) {
    const p = E.findPerson(id);
    if (!p) return;
    const S = E.S;
    let h = personCard(p, '') +
      '<div class="kv" style="margin-top:12px">' +
      '<span class="k">性格</span><span class="v">' + E.toneOf(p).name + '</span>' +
      '<span class="k">入社</span><span class="v">' + p.joinFY + '年</span>' +
      '<span class="k">直近の昇進</span><span class="v">' + p.promoFY + '年</span>' +
      '<span class="k">月次給与</span><span class="v down">-' + money(E.personCost(p)) + '</span>' +
      '</div>' +
      '<div class="quote"><b>' + esc(p.name) + '</b>「' + E.toneOf(p).join + '」</div>' +
      '<h3>配属</h3><div class="aggr" style="grid-template-columns:repeat(3,1fr)">';
    D.DIVISIONS.forEach(function (d) {
      h += '<button data-pdiv="' + p.id + '" data-v="' + d.id + '" class="' + (p.div === d.id ? 'on' : '') + '">' +
        '<b>' + d.icon + '</b>' + d.short + '</button>';
    });
    h += '</div><h3>駐在</h3><div class="aggr" style="grid-template-columns:repeat(4,1fr)">' +
      '<button data-preg="' + p.id + '" data-v="" class="' + (!p.region ? 'on' : '') + '"><b>🏢</b>本社</button>';
    S.offices.forEach(function (r) {
      if (r === 'jp') return;
      h += '<button data-preg="' + p.id + '" data-v="' + r + '" class="' + (p.region === r ? 'on' : '') + '">' +
        '<b>' + D.REGION_BY_ID[r].flag + '</b>' + D.REGION_BY_ID[r].name + '</button>';
    });
    h += '</div><p class="tiny muted">駐在させると本人の成長が35%速くなり、その地域の案件で落札力 +6pt。</p>' +
      '<div class="mbtns">' +
      (p.role < 3 ? '<button class="pri" data-phead="' + p.id + '">本部長に任命</button>' : '<button disabled>本部長</button>') +
      '<button data-close>閉じる</button></div>';
    modal(h);
  }

  function viewRank() {
    const S = E.S;
    let h = '<div class="card"><div class="sect">世界ランキング（純資産）</div>';
    E.ranking().forEach(function (r, i) {
      h += '<div class="rank' + (r.me ? ' me' : '') + '"><div class="no">' + (i + 1) + '</div>' +
        '<div class="nm">' + esc(r.name) + (r.me ? ' <span class="pill">自社</span>' : '') +
        '<div class="tiny muted">収益 ' + money(r.rev || 0) + '</div></div>' +
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

    if (S.planHistory && S.planHistory.length) {
      h += '<div class="card"><div class="sect">中期経営計画の実績</div>';
      S.planHistory.slice().reverse().forEach(function (v) {
        h += '<div class="divrow"><div class="ic">' + (v.count === 3 ? '🏆' : v.count === 0 ? '💥' : '📄') + '</div>' +
          '<div class="nm"><b>第' + v.no + '次（' + v.startFY + '〜' + v.endFY + '）</b>' +
          '<div class="tiny muted">' + v.cards.map(function (c) { return (D.CARD_BY_ID[c] || {}).name || c; }).join(' ／ ') + '</div></div>' +
          '<div class="lv"><b class="' + (v.count === 3 ? 'up' : v.count === 0 ? 'down' : '') + '">' + v.count + '/3</b></div></div>';
      });
      h += '</div>';
    }

    if (S.fyHistory.length) {
      const rows = S.fyHistory.slice(-10);
      if (rows.length >= 3) {
        h += '<div class="card"><div class="sect">年次推移</div>' +
          fyBars(rows, 'revenue', '#2f86e0', '収益（売上高）', false) +
          fyBars(rows, 'profit', '#ab8129', '当期純利益', true) +
          '<p class="tiny muted" style="margin:6px 0 0">純利益の棒は上向きが黒字、下向きの斜線が赤字。棒に触れると年度と金額が出る。</p></div>';
      }
      h += '<div class="card"><div class="sect">決算履歴</div>' +
        '<table class="paytbl"><thead><tr><th>期</th><th>収益</th><th>純利益</th><th>ROE</th></tr></thead><tbody>' +
        S.fyHistory.slice().reverse().slice(0, 12).map(function (f) {
          return '<tr><td>' + f.fy + '/3</td><td>' + money(f.revenue || 0) + '</td>' +
            '<td class="' + (f.profit >= 0 ? 'up' : 'down') + '">' + signed(f.profit) + '</td>' +
            '<td>' + pct(f.roe || 0, 0) + '</td></tr>';
        }).join('') + '</tbody></table></div>';

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
      '<h3>条件</h3>' + terms + advice(d) +
      (err ? '<p class="down small" style="margin-top:12px">⚠ ' + err + '</p>' : '') +
      '<div class="mbtns"><button data-close>見送る</button>' +
      '<button class="pri" data-bid="' + d.id + '"' + (err ? ' disabled' : '') + '>この条件で応札</button></div>'
    );
  }

  /* 大型案件では担当本部の幹部が意見を述べる */
  function advice(d) {
    const S = E.S, eq = Math.max(1, E.equity());
    if (d.exposure < eq * 0.22) return '';
    const board = d.exposure > eq * 0.30;
    let ps = E.divPeople(d.div).sort(function (a, b) { return b.role - a.role || b.sales - a.sales; });
    if (board) {
      const others = S.people.filter(function (p) { return p.div !== d.div && p.role >= 2; })
        .sort(function (a, b) { return b.role - a.role; });
      ps = ps.slice(0, 2).concat(others.slice(0, 2)).slice(0, 3);
    } else ps = ps.slice(0, 1);
    if (!ps.length) {
      return '<div class="quote"><b>（意見を述べられる幹部がいない）</b>誰も中身を検証しないまま、判子だけが回っている。</div>';
    }
    const p0 = E.winScore(d, curStance), mk = E.mfac(d.comms);
    let yes = 0, h = '';
    ps.forEach(function (p) {
      const t = E.toneOf(p);
      const ok = p0 > 0.34 && mk > 0.88 - (p.eye - 50) / 260;
      if (ok) yes++;
      h += '<div class="quote" style="border-left-color:' + (ok ? 'var(--up)' : 'var(--down)') + '">' +
        '<b>' + p.face + ' ' + esc(p.name) + '（' + D.ROLES[p.role] + '・' +
        D.DIV_BY_ID[p.div].short + '）<span class="' + (ok ? 'up' : 'down') + '" style="float:right">' +
        (ok ? '賛成' : '反対') + '</span></b>「' + (ok ? t.yes : t.no) + '」</div>';
    });
    return (board
      ? '<h3>役員会（純資産の30%を超える案件）</h3>' +
        (yes * 2 <= ps.length
          ? '<p class="tiny down">役員会は反対多数。押し切ることはできるが、その責任は経営者が負う。</p>'
          : '<p class="tiny up">役員会は賛成多数。</p>')
      : '<h3>担当本部の意見</h3>') + h;
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

  /* --- M&A モーダル --- */
  let curMA = null, curOffer = 2;
  function maOpen(id) {
    const t = E.findTarget(id);
    if (!t) return;
    curMA = t; curOffer = 2;
    maDraw();
  }
  function maDraw() {
    const t = curMA, S = E.S;
    const dv = D.DIV_BY_ID[t.div], rg = D.REGION_BY_ID[t.region];
    const o = D.MA_OFFERS[curOffer];
    const price = E.maPrice(t, curOffer);
    const gw = price - t.netAssets;
    const p = E.maWin(t, curOffer);
    const err = E.maCheck(t, curOffer);
    const col = p > 0.55 ? 'var(--up)' : p > 0.3 ? 'var(--warn)' : 'var(--down)';
    const yr = t.dd ? t.trueProfit : t.shownProfit;

    let offers = '<div class="aggr">';
    D.MA_OFFERS.forEach(function (x, i) {
      offers += '<button data-offer="' + i + '" class="' + (i === curOffer ? 'on' : '') + '"><b>' + x.n + '</b>×' + x.k.toFixed(2) + '</button>';
    });
    offers += '</div><p class="tiny" style="margin-bottom:12px">' + o.desc + '</p>';

    modal('<h2>🏢 ' + esc(t.name) + '</h2>' +
      '<p class="tiny" style="margin-bottom:12px">' +
        '<span class="pill">' + dv.icon + ' ' + dv.name + '</span> ' +
        '<span class="pill">' + rg.flag + ' ' + rg.name + '</span> ' +
        '<span class="pill">' + (t.listed ? '上場企業' : '非上場') + '</span> ' +
        '<span class="pill">競合 ' + t.rivals + '社</span></p>' +
      '<h3>デューデリジェンス</h3>' +
      (t.dd
        ? '<div class="kv"><span class="k">実力純利益（年）</span><span class="v up">' + money(t.trueProfit) + '</span>' +
          '<span class="k">簿外債務</span><span class="v ' + (t.hidden > 0 ? 'down' : 'up') + '">' +
          (t.hidden > 0 ? money(t.hidden) + ' を発見' : 'なし') + '</span></div>'
        : '<p class="tiny warn">未実施。開示された数字は ' + money(t.shownProfit) + '/年 だが、<strong>実力値も簿外債務も見えていない</strong>。' +
          'DDを省いて買えば、簿外債務はそのまま当社の損失になる。</p>' +
          '<button class="act" style="width:100%" data-dd="' + t.id + '">DDを実施する（' + money(E.ddCost(t)) + '）</button>') +
      '<h3>買収条件</h3>' + offers +
      '<div class="kv">' +
      '<span class="k">純資産</span><span class="v">' + money(t.netAssets) + '</span>' +
      '<span class="k">買収価額</span><span class="v down">-' + money(price) + '</span>' +
      '<span class="k">のれん</span><span class="v ' + (gw > t.netAssets * 0.3 ? 'down' : '') + '">' + money(gw) + '</span>' +
      '<span class="k">投資利回り（' + (t.dd ? '実力' : '表面') + '）</span><span class="v">' + pct(yr / price) + '/年</span>' +
      '</div>' +
      (gw > 0 ? '<p class="tiny muted" style="margin-top:8px">のれんは償却しない。平時は無害だが、統合に失敗すると一括で減損する。</p>' : '') +
      '<h3>成約確度</h3>' +
      '<div class="gauge"><i style="width:' + (p * 100).toFixed(0) + '%;background:' + col + '"></i></div>' +
      '<div class="row small"><span class="muted">' + dv.short + 'の陣容・格付・信用</span>' +
      '<b style="color:' + col + '">' + Math.round(p * 100) + '%</b></div>' +
      (err ? '<p class="down small" style="margin-top:12px">⚠ ' + err + '</p>' : '') +
      '<div class="mbtns"><button data-close>見送る</button>' +
      '<button class="pri" data-buy="' + t.id + '"' + (err ? ' disabled' : '') + '>買収を提案する</button></div>');
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

  /* ---------- 決算ウィザード（4ステップ） ---------- */
  let fyW = null;
  const STEP_NAMES = {
    result: '決算発表', rating: '格付レビュー', planEval: '中期経営計画 総括', hr: '人事',
    vote: '社長信任投票',
    budget: '資源配分', payout: '株主還元', planNew: '中期経営計画 策定',
  };

  function fyOpen(rec, done) {
    const steps = ['result', 'rating', 'hr'];
    if (rec.needEval) steps.push('planEval');
    steps.push('budget', 'payout');
    if (rec.needPlan) steps.push('planNew');
    if (rec.needVote) steps.push('vote');
    fyW = {
      rec: rec, steps: steps, step: 0, done: done,
      alloc: {}, unit: E.budgetUnit(), pool: E.budgetPool(),
      ratio: 0.3, buyback: 0, allocated: false,
      evalRes: null, voteRes: null, gradIdx: 0, gradDone: false, promos: [],
      tiers: { profit: 1, roe: 1, invest: 1 }, cards: [],
    };
    fyDraw();
  }
  function allocSum() { let t = 0; for (const k in fyW.alloc) t += fyW.alloc[k]; return t; }
  function allocGet(id) { return fyW.alloc[id] || 0; }

  function fyDraw() {
    const w = fyW, r = w.rec, S = E.S;
    const id = w.steps[w.step], last = w.step === w.steps.length - 1;
    let dots = '<div class="wiz-step">';
    for (let i = 0; i < w.steps.length; i++) dots += '<i class="' + (i <= w.step ? 'on' : '') + '"></i>';
    dots += '</div>';
    const head = '<p class="tiny" style="margin-bottom:2px;letter-spacing:.14em;color:var(--dim2)">' +
      r.fy + '年3月期 決算 ／ STEP ' + (w.step + 1) + ' of ' + w.steps.length + '</p>' +
      '<h2>' + STEP_NAMES[id] + '</h2>';
    const NEXT = '<button class="pri" data-fy="next">次へ</button>';
    const BACK = '<button data-fy="back">戻る</button>';
    let body = '', btns = '';

    if (id === 'result') {
      const grow = r.eqStart > 0 ? (r.eqEnd / r.eqStart - 1) : 0;
      let tbl = '<table class="seg-t"><thead><tr><th>本部</th><th>商い</th><th>配当</th><th>評価・減損</th><th>計</th></tr></thead><tbody>';
      let tot = 0;
      D.DIVISIONS.forEach(function (d) {
        const x = (r.seg && r.seg[d.id]) || { gross: 0, dividend: 0, reval: 0, impair: 0 };
        const t = E.segTotal(x); tot += t;
        tbl += '<tr><td>' + d.icon + ' ' + d.short + '</td>' +
          '<td>' + (Math.abs(x.gross) > .005 ? signed(x.gross) : '—') + '</td>' +
          '<td>' + (Math.abs(x.dividend) > .005 ? signed(x.dividend) : '—') + '</td>' +
          '<td class="' + (x.reval + x.impair < 0 ? 'down' : '') + '">' + (Math.abs(x.reval + x.impair) > .005 ? signed(x.reval + x.impair) : '—') + '</td>' +
          '<td class="' + (Math.abs(t) < .005 ? 'muted' : t >= 0 ? 'up' : 'down') + '"><b>' +
          (Math.abs(t) < .005 ? '—' : signed(t)) + '</b></td></tr>';
      });
      const corp = (r.wage || 0) + (r.sga || 0) + (r.interest || 0) + (r.gain || 0);
      tbl += '<tr class="corp"><td>全社費用</td><td colspan="3" style="text-align:left;font-size:10px" class="muted">人件費・販管費・支払利息ほか</td>' +
        '<td class="down">' + signed(corp) + '</td></tr>' +
        '<tr class="tot"><td>当期純利益</td><td colspan="3"></td><td class="' + (r.profit >= 0 ? 'up' : 'down') + '">' + signed(r.profit) + '</td></tr>' +
        '</tbody></table>';
      const margin = r.revenue > 0 ? r.profit / r.revenue : 0;
      body = '<h3>年次業績</h3>' +
        '<table class="paytbl"><tbody>' +
        '<tr><td>取扱高</td><td colspan="2"><b>' + money(r.gtv || 0) + '</b></td></tr>' +
        '<tr><td>収益（売上高）</td><td colspan="2">' + money(r.revenue || 0) + '</td></tr>' +
        '<tr><td>費用</td><td colspan="2" class="down">-' + money(r.cost || 0) + '</td></tr>' +
        '<tr class="' + (r.profit >= 0 ? '' : 'none') + '"><td><b>当期純利益</b></td>' +
        '<td colspan="2" class="' + (r.profit >= 0 ? 'up' : 'down') + '"><b>' + signed(r.profit) + '</b></td></tr>' +
        '<tr><td>売上高純利益率</td><td colspan="2">' + pct(margin) + '</td></tr>' +
        '</tbody></table>' +
        '<p class="tiny muted">取扱高はトレードの取扱総額・請負金額・傘下事業会社の年商の合計。' +
        '収益は口銭・請負・配当・評価益の合計で、費用を引いたものが当期純利益になる。</p>' +
        '<h3>セグメント別損益</h3>' + tbl +
        '<h3>本部別 収益・取扱高</h3><table class="paytbl"><thead><tr><th>本部</th><th>収益</th><th>取扱高</th></tr></thead><tbody>' +
        D.DIVISIONS.map(function (d) {
          const x = (r.seg && r.seg[d.id]) || { rev: 0, gtv: 0 };
          const nil = !(x.rev > 0.005 || x.gtv > 0.005);
          return '<tr class="' + (nil ? 'none' : '') + '"><td>' + d.icon + ' ' + d.short + '</td>' +
            '<td>' + (nil ? '—' : money(x.rev || 0)) + '</td>' +
            '<td>' + (nil ? '—' : money(x.gtv || 0)) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<h3>要約</h3><div class="fy-grid">' +
        '<div class="b"><label>ROE</label><b class="' + (r.roe >= 0.08 ? 'up' : r.roe < 0 ? 'down' : '') + '">' + pct(r.roe) + '</b></div>' +
        '<div class="b"><label>純資産</label><b class="gold">' + money(r.eqEnd) + '</b></div>' +
        '<div class="b"><label>純資産成長率</label><b class="' + (grow >= 0 ? 'up' : 'down') + '">' + pct(grow) + '</b></div>' +
        '<div class="b"><label>株価 / PBR</label><b>' + Math.round(r.price).toLocaleString('ja-JP') + '円 / ' + r.pbr.toFixed(2) + '</b></div>' +
        '<div class="b"><label>完了案件</label><b>' + r.deals + '件</b></div>' +
        '<div class="b"><label>世界順位</label><b>' + r.rank + '位</b></div>' +
        '<div class="b"><label>社員数</label><b>' + (r.staff || 0).toLocaleString('ja-JP') + '</b></div>' +
        '<div class="b"><label>平均年収（' + (r.payBand || '標準') + '）</label><b>' + (r.avgSalary || 0).toLocaleString('ja-JP') + '万</b></div>' +
        '</div>';
      btns = '<div class="mbtns">' + NEXT + '</div>';

    } else if (id === 'rating') {
      const rt = E.rating(), sc = E.ratingScore();
      const eq = Math.max(1, E.equity()), de = S.debt / eq;
      const roeS = E.clamp((S.roeTTM || 0) * 100 - 6, -12, 16);
      const deS = E.clamp((1.15 - de) * 13, -20, 10);
      body = '<p>格付機関との対話。<strong>ROEと財務レバレッジ</strong>が、当社の借入枠・調達金利・入札での信認をまとめて決める。</p>' +
        '<div class="row" style="align-items:center;margin-bottom:10px">' +
        '<span class="muted small">格付</span>' +
        '<b class="gold" style="font-size:30px;letter-spacing:.05em">' + rt.label + '</b></div>' +
        '<div class="gauge"><i style="width:' + sc.toFixed(0) + '%;background:linear-gradient(90deg,#8a6d2c,var(--gold))"></i></div>' +
        '<div class="kv" style="margin-top:12px">' +
        '<span class="k">信用力（取引実績・不祥事）</span><span class="v">' + (S.credit * 0.62).toFixed(1) + '</span>' +
        '<span class="k">ROE評価</span><span class="v ' + (roeS >= 0 ? 'up' : 'down') + '">' + (roeS >= 0 ? '+' : '') + roeS.toFixed(1) + '</span>' +
        '<span class="k">財務レバレッジ（D/E ' + de.toFixed(2) + '倍）</span><span class="v ' + (deS >= 0 ? 'up' : 'down') + '">' + (deS >= 0 ? '+' : '') + deS.toFixed(1) + '</span>' +
        '<span class="k">サステナ・内部統制</span><span class="v up">+' + (E.corpOf('esg') * 2.2).toFixed(1) + '</span>' +
        '</div>' +
        '<h3>格付がもたらすもの</h3><div class="kv">' +
        '<span class="k">借入枠（純資産倍率）</span><span class="v">' + rt.lev.toFixed(1) + '倍 ＝ ' + money(E.borrowLimit()) + '</span>' +
        '<span class="k">調達金利（年）</span><span class="v">' + pct(E.interestRate(), 2) + '</span>' +
        '<span class="k">入札での信認</span><span class="v ' + (rt.win >= 0 ? 'up' : 'down') + '">' + (rt.win >= 0 ? '+' : '') + rt.win + 'pt</span>' +
        '</div>';
      btns = '<div class="mbtns">' + BACK + NEXT + '</div>';

    } else if (id === 'hr') {
      const pe = r.people || { retired: [], graduated: [] };
      const block = E.hireBlock();
      const opts = [0, 1, 2, 3].map(function (k) { return E.gradPlan(k); });
      const n = opts[w.gradIdx];
      body = '';
      if (pe.retired.length || pe.graduated.length) {
        body += '<h3>この1年の人事</h3>';
        pe.retired.forEach(function (p) {
          body += '<div class="pnews"><span class="f">' + p.face + '</span><span class="muted">' +
            esc(p.name) + '（' + p.age + '・' + D.ROLES[p.role] + '）が定年退任した。</span></div>';
        });
        pe.graduated.forEach(function (p) {
          body += '<div class="pnews"><span class="f">' + p.face + '</span><span class="up">' +
            esc(p.name) + '（' + p.age + '）が幹部候補として頭角を現した。</span></div>';
        });
      }
      body += '<h3>士気と給与</h3><div class="gauge"><i style="width:' + Math.round(S.morale) + '%;background:' +
        (S.morale >= 65 ? 'var(--up)' : S.morale < 45 ? 'var(--down)' : 'var(--warn)') + '"></i></div>' +
        '<div class="row tiny"><span class="muted">幹部 ' + S.people.length + '名 ／ 平均年齢 ' +
        (S.people.length ? Math.round(S.people.reduce(function (a, p) { return a + p.age; }, 0) / S.people.length) : '—') + '歳</span>' +
        '<b class="' + (S.morale >= 65 ? 'up' : S.morale < 45 ? 'down' : 'warn') + '">' + Math.round(S.morale) + '</b></div>' +
        payBandPicker() + payTable();

      body += '<h3>新卒採用の方針</h3><div class="pol">';
      D.GRAD_POLICIES.forEach(function (pl, i) {
        body += '<button data-gpol="' + i + '" class="' + (i === S.gradPolicy ? 'on' : '') + '"' +
          (w.gradDone ? ' disabled' : '') + '>' +
          '<b>' + pl.icon + ' ' + pl.name + '</b>' +
          '<span class="g">＋' + pl.good + '</span><span class="x">−' + pl.bad + '</span></button>';
      });
      body += '</div>';

      body += '<h3>採用人数</h3><div class="aggr" style="grid-template-columns:repeat(4,1fr)">';
      opts.forEach(function (v, i) {
        body += '<button data-grad="' + i + '" class="' + (i === w.gradIdx ? 'on' : '') + '"' +
          (w.gradDone ? ' disabled' : '') + '><b>' + (v ? v.toLocaleString('ja-JP') : '見送る') + '</b>' +
          (v ? money(E.gradCost(v)) : '—') + '</button>';
      });
      body += '</div>' + (w.gradDone
        ? '<p class="tiny up">✓ ' + (n ? '採用を実行した' : '今年度は見送った') + '</p>'
        : '<div class="kv" style="margin-top:8px">' +
          '<span class="k">内定承諾率（給与水準・士気・信用）</span><span class="v ' + (E.gradAccept() > 0.85 ? 'up' : '') + '">' + pct(E.gradAccept(), 0) + '</span>' +
          '<span class="k">実際の入社見込み</span><span class="v">' + Math.round(n * E.gradAccept()).toLocaleString('ja-JP') + '名</span>' +
          '<span class="k">4年後に立つ幹部候補</span><span class="v gold">' + E.gradYield(Math.round(n * E.gradAccept())) + '名</span>' +
          '</div>');

      const slots = E.promoteSlots() - w.promos.length;
      body += '<h3>昇進（残り ' + slots + '枠）</h3>';
      const cands = S.people.filter(function (p) { return p.role < 4; })
        .sort(function (a, b) { return E.personPower(b) - E.personPower(a); });
      if (!cands.length) body += '<p class="tiny muted">昇進させられる人材がいない。</p>';
      cands.slice(0, 8).forEach(function (p) {
        const done = w.promos.indexOf(p.id) >= 0;
        body += '<div class="alloc"><div class="ic">' + p.face + '</div>' +
          '<div class="nm"><b>' + esc(p.name) + '</b><span>' + D.DIV_BY_ID[p.div].short + ' ／ ' + D.ROLES[p.role] +
          ' ／ 総合力 ' + Math.round(E.personPower(p)) + ' ／ 前回昇進 ' + p.promoFY + '年</span></div>' +
          '<div class="pm"><button data-promo="' + p.id + '"' + (done || slots <= 0 ? ' disabled' : '') + '>' +
          (done ? '✓' : '⬆') + '</button></div></div>';
      });
      body += '<p class="tiny muted" style="margin-top:8px">昇進が止まった幹部は不満を溜め、いずれ他社に引き抜かれる。</p>';
      btns = '<div class="mbtns">' + BACK + NEXT + '</div>';

    } else if (id === 'vote') {
      if (!w.voteRes) w.voteRes = E.ceoVote();
      const v = w.voteRes;
      body = '<p>就任から' + D.CONFIDENCE_EVERY + '事業年度。取締役会と株主が、経営陣を続投させるかを問う。</p>' +
        '<div class="row" style="align-items:center;margin:14px 0 6px">' +
        '<span class="muted small">信任スコア（40以上で続投）</span>' +
        '<b class="' + (v.pass ? 'up' : 'down') + '" style="font-size:32px">' + Math.round(v.score) + '</b></div>' +
        '<div class="gauge"><i style="width:' + Math.round(v.score) + '%;background:' +
        (v.pass ? 'var(--up)' : 'var(--down)') + '"></i></div><div class="kv" style="margin-top:12px">';
      v.detail.forEach(function (x) {
        body += '<span class="k">' + x.k + '</span><span class="v ' + (x.v >= 0 ? 'up' : 'down') + '">' +
          (x.v >= 0 ? '+' : '') + x.v.toFixed(1) + '</span>';
      });
      body += '</div><p class="' + (v.pass ? 'up' : 'down') + '" style="margin-top:14px">' +
        (v.pass ? '信任された。任期が延長され、実績ボーナスが積み増された。'
                : '不信任。あなたはこの会社の経営から外れることになった。') + '</p>';
      btns = '<div class="mbtns"><button class="pri" data-fy="finish">' +
        (v.pass ? '次の任期へ' : '退任する') + '</button></div>';

    } else if (id === 'planEval') {
      if (!w.evalRes) w.evalRes = E.evaluatePlan(r);
      const v = w.evalRes;
      body = '<p>第' + v.no + '次中期経営計画（' + v.startFY + '〜' + v.endFY + '年3月期）が満了した。</p>' +
        '<div class="row" style="align-items:center;margin:14px 0 4px">' +
        '<span class="muted small">達成項目</span>' +
        '<b class="' + (v.count === 3 ? 'up' : v.count === 0 ? 'down' : 'gold') + '" style="font-size:30px">' +
        v.count + ' / 3</b></div>';
      v.items.forEach(function (x) {
        const it = D.PLAN_ITEMS.filter(function (y) { return y.id === x.id; })[0];
        const f = x.id === 'roe' ? function (n) { return pct(n); } : money;
        body += '<div class="alloc"><div class="ic">' + (x.ok ? '✅' : '❌') + '</div>' +
          '<div class="nm"><b>' + it.name + '</b><span>目標 ' + f(x.target) + ' ／ 実績 ' + f(x.actual) + '</span></div>' +
          '<div class="amt ' + (x.ok ? 'up' : 'down') + '">' + (x.ok ? '達成' : '未達') + '</div></div>';
      });
      body += '<p class="' + (v.tone || '') + '" style="margin-top:14px">' + v.msg + '</p>' +
        '<div class="kv"><span class="k">株主信任</span><span class="v">' + Math.round(S.trust) + ' / 100</span>' +
        '<span class="k">PBR</span><span class="v ' + (S.pbr < 1 ? 'down' : 'up') + '">' + S.pbr.toFixed(2) + ' 倍</span>' +
        '<span class="k">実績ボーナス（投資余力・落札力）</span><span class="v ' + (v.gain >= 0 ? 'up' : 'down') + '">' +
        (v.gain >= 0 ? '+' : '') + v.gain.toFixed(2) + ' → ' + (v.bonus || 0).toFixed(2) + '</span></div>';
      btns = '<div class="mbtns">' + NEXT + '</div>';

    } else if (id === 'budget') {
      const used = allocSum(), left = w.pool - used;
      body = '<p>翌1年の投資予算を配る。<strong>本部予算は1年で切れ、配らなかった本部は地力を失う。</strong>コーポレート投資は蓄積するが毎年目減りする。</p>' +
        '<div class="pool"><span class="muted">残り配分枠<br><span class="tiny">当初 ' + money(w.pool) + '（現金の65%）</span></span>' +
        '<b class="' + (left < w.unit ? 'gold' : '') + '">' + money(left) + '</b></div>' +
        '<h3>営業本部</h3>';
      D.DIVISIONS.forEach(function (d) {
        const a = allocGet(d.id), b = a / (E.scale() * 5);
        body += '<div class="alloc"><div class="ic">' + d.icon + '</div>' +
          '<div class="nm"><b>' + d.short + '</b><span>Lv.' + S.div[d.id].lv +
            (a > 0 ? ' ／ 強化 ×' + Math.min(3, b).toFixed(1) : ' ／ 無投資（地力が落ちる）') + '</span></div>' +
          '<div class="amt ' + (a > 0 ? 'gold' : 'muted') + '">' + (a > 0 ? money(a) : '—') + '</div>' +
          '<div class="pm"><button data-alloc="' + d.id + '" data-d="-1"' + (a <= 0 ? ' disabled' : '') + '>−</button>' +
          '<button data-alloc="' + d.id + '" data-d="1"' + (left < w.unit ? ' disabled' : '') + '>＋</button></div></div>';
      });
      body += '<h3>コーポレート</h3>';
      D.BUDGET_CORP.forEach(function (c) {
        const a = allocGet(c.id);
        body += '<div class="alloc"><div class="ic">' + c.icon + '</div>' +
          '<div class="nm"><b>' + c.name + '</b><span>' + c.desc + '（現水準 ' + E.corpOf(c.id).toFixed(1) + '）</span></div>' +
          '<div class="amt ' + (a > 0 ? 'gold' : 'muted') + '">' + (a > 0 ? money(a) : '—') + '</div>' +
          '<div class="pm"><button data-alloc="' + c.id + '" data-d="-1"' + (a <= 0 ? ' disabled' : '') + '>−</button>' +
          '<button data-alloc="' + c.id + '" data-d="1"' + (left < w.unit ? ' disabled' : '') + '>＋</button></div></div>';
      });
      const none = D.DIVISIONS.filter(function (d) { return !allocGet(d.id); }).length;
      if (none) body += '<p class="tiny warn" style="margin-top:10px">⚠ ' + none + '本部が無投資。放置した本部は毎月わずかに地力を失い、やがてレベルが下がる。</p>';
      btns = '<div class="mbtns">' + BACK +
        '<button class="pri" data-fy="next">この予算で確定（' + money(used) + '）</button></div>';

    } else if (id === 'payout') {
      const profit = Math.max(0, r.profit);
      const div = profit * w.ratio;
      const maxBB = Math.max(0, S.cash * 0.35);
      const price = E.sharePrice();
      const cut = price > 0.01 ? (w.buyback / price) / Math.max(0.0001, S.shares) : 0;
      body = '<p>当期純利益 <b class="' + (r.profit >= 0 ? 'up' : 'down') + '">' + signed(r.profit) + '</b> の使い道を決める。' +
        '還元は株主信任と株価を押し上げるが、現金は減る。</p>' +
        '<h3>配当性向</h3>' +
        '<div class="row"><span class="muted small">' + Math.round(w.ratio * 100) + '% を配当</span>' +
        '<b class="gold num" style="font-size:19px">' + money(div) + '</b></div>' +
        '<input class="range" type="range" min="0" max="100" step="5" value="' + Math.round(w.ratio * 100) + '" id="rg-div">' +
        '<h3>自社株買い</h3>' +
        '<div class="row"><span class="muted small">株式数 −' + pct(cut, 1) + '</span>' +
        '<b class="gold num" style="font-size:19px">' + money(w.buyback) + '</b></div>' +
        '<input class="range" type="range" min="0" max="1000" value="' + (maxBB > 0 ? Math.round(w.buyback / maxBB * 1000) : 0) + '" id="rg-bb">' +
        '<div class="row tiny muted"><span>0</span><span>上限 ' + money(maxBB) + '（現金の35%）</span></div>' +
        '<h3>見込まれる反応</h3><div class="kv">' +
        '<span class="k">株主信任</span><span class="v ' + (w.ratio > 0 || w.buyback > 0 ? 'up' : 'down') + '">' +
          (w.ratio >= 0.5 ? '+9' : w.ratio >= 0.3 ? '+6' : w.ratio > 0 ? '+2' : '−7') + (w.buyback > 0 ? ' +4' : '') + '</span>' +
        '<span class="k">支出合計</span><span class="v down">-' + money(div + w.buyback) + '</span>' +
        '<span class="k">残る現金</span><span class="v">' + money(Math.max(0, S.cash - div - w.buyback)) + '</span>' +
        '</div>';
      btns = '<div class="mbtns"><button class="pri" data-fy="' + (last ? 'finish' : 'next') + '">' +
        (last ? '決議して次年度へ' : '決議して中計策定へ') + '</button></div>';

    } else {
      /* 中期経営計画の策定 */
      const opt = E.planTargetOptions();
      const fyStart = E.fiscalYear() + 1;
      body = '<p>今後3年（' + fyStart + '〜' + (fyStart + 2) + '年3月期）で何を約束するかを決める。' +
        '<strong>挑戦的な目標ほど達成時の見返りは大きく、未達のときの反動も大きい。</strong></p>' +
        '<h3>数値目標</h3>';
      D.PLAN_ITEMS.forEach(function (it) {
        const cur = w.tiers[it.id];
        body += '<div style="margin-bottom:14px"><div class="row"><b style="font-size:13px">' + it.name + '</b>' +
          '<b class="gold num">' + (it.unit === 'pct' ? pct(opt[it.id][cur]) : money(opt[it.id][cur])) + '</b></div>' +
          '<div class="tiny muted" style="margin-bottom:6px">' + it.desc + '</div><div class="aggr">';
        D.PLAN_TIERS.forEach(function (tn, i) {
          body += '<button data-tier="' + it.id + '" data-i="' + i + '" class="' + (i === cur ? 'on' : '') + '"' +
            ' style="grid-column:span 1"><b>' + tn + '</b>' +
            (it.unit === 'pct' ? pct(opt[it.id][i], 0) : money(opt[it.id][i])) + '</button>';
        });
        body += '</div></div>';
      });
      body += '<h3>重点戦略（2枚選ぶ・3年間有効）</h3>';
      D.PLAN_CARDS.forEach(function (c) {
        const on = w.cards.indexOf(c.id) >= 0;
        body += '<button class="deal" data-card="' + c.id + '"' +
          (on ? ' style="border-color:var(--gold);background:rgba(217,178,95,.10)"' : '') + '>' +
          '<div class="deal-h"><div class="deal-t">' + c.icon + ' ' + c.name + '</div>' +
          (on ? '<span class="pill" style="color:var(--gold2);border-color:var(--gold)">選択中</span>' : '') + '</div>' +
          '<div class="tiny up" style="margin-top:6px">＋ ' + c.good + '</div>' +
          '<div class="tiny down" style="margin-top:3px">− ' + c.bad + '</div></button>';
      });
      btns = '<div class="mbtns"><button class="pri" data-fy="finish"' + (w.cards.length !== 2 ? ' disabled' : '') + '>' +
        (w.cards.length !== 2 ? 'あと' + (2 - w.cards.length) + '枚選ぶ' : '第' + ((E.S.planNo || 0) + 1) + '次中計を発表する') + '</button></div>';
    }

    modal(dots + head + body + btns, true);

    if (id === 'payout') {
      const S2 = E.S, maxBB = Math.max(0, S2.cash * 0.35);
      const rd = $('#rg-div'), rb = $('#rg-bb');
      if (rd) rd.addEventListener('input', function (e) { w.ratio = +e.target.value / 100; fyDraw(); });
      if (rb) rb.addEventListener('input', function (e) { w.buyback = maxBB * (+e.target.value / 1000); fyDraw(); });
    }
  }

  function fyAlloc(id, d) {
    const w = fyW, u = w.unit;
    const cur = allocGet(id);
    if (d > 0) {
      if (w.pool - allocSum() < u) return;
      w.alloc[id] = cur + u;
    } else {
      w.alloc[id] = Math.max(0, cur - u);
      if (w.alloc[id] <= 0) delete w.alloc[id];
    }
    fyDraw();
  }

  function fyGrad(i) { if (!fyW.gradDone) { fyW.gradIdx = i; fyDraw(); } }
  function fyGradPol(i) { if (!fyW.gradDone) { E.setGradPolicy(i); fyDraw(); } }
  function setBand(i) { E.setPayBand(i); if (fyW) fyDraw(); render(); }
  function fyPromo(id) {
    if (fyW.promos.length >= E.promoteSlots()) return;
    if (fyW.promos.indexOf(id) >= 0) return;
    if (E.promotePerson(id).ok) { fyW.promos.push(id); fyDraw(); }
  }
  function fyTier(item, i) { fyW.tiers[item] = i; fyDraw(); }
  function fyCard(id) {
    const c = fyW.cards, i = c.indexOf(id);
    if (i >= 0) c.splice(i, 1);
    else if (c.length < 2) c.push(id);
    fyDraw();
  }

  function fyCommitStep() {
    const w = fyW, id = w.steps[w.step];
    if (id === 'hr' && !w.gradDone) {
      E.hireGrads(E.gradPlan(w.gradIdx));
      w.gradDone = true;
    }
    if (id === 'budget' && !w.allocated) { E.allocateBudget(w.alloc); w.allocated = true; }
    if (id === 'payout' && !w.paid) { E.payout({ ratio: w.ratio, buyback: w.buyback }); w.paid = true; }
    if (id === 'planNew' && !w.planned) { E.formulatePlan(w.tiers, w.cards); w.planned = true; }
  }

  function fyNav(dir) {
    const w = fyW;
    if (!w) return;
    if (dir === 'back') { w.step = Math.max(0, w.step - 1); fyDraw(); return; }
    fyCommitStep();
    if (dir === 'next' && w.step < w.steps.length - 1) { w.step++; fyDraw(); return; }
    const done = w.done; fyW = null;
    closeModal(); render();
    if (done) done();
  }

  function promoteModal(st, after, raise) {
    onClose = after;
    modal('<div class="evt-ic">🎖️</div>' +
      '<h2 style="text-align:center" class="gold">' + st.name + ' へ昇格</h2>' +
      '<p style="text-align:center;margin-top:10px">' + st.title + '<br><br>' +
      '取り扱える案件の規模が跳ね上がった。<br>より大きな資金と、より大きなリスクの世界へ。</p>' +
      (raise ? '<div class="card" style="margin:14px 0 0"><div class="row"><span class="small muted">公募増資による調達</span>' +
        '<b class="gold num">' + money(raise) + '</b></div>' +
        '<p class="tiny muted" style="margin:7px 0 0">PBRが1倍を超えていたため、市場から資金を調達できた。1株当たり純資産は薄まるが、成長の原資になる。</p></div>' : '') +
      '<div class="mbtns"><button class="pri" data-close>次の段階へ</button></div>', true);
  }

  function tobModal(t, after) {
    onClose = after;
    const S = E.S;
    modal('<div class="evt-ic">⚔️</div><h2 style="text-align:center" class="down">敵対的買収提案</h2>' +
      '<p style="margin-top:10px">' + esc(t.raider) + ' が、当社株に ' + pct(t.premium, 0) +
      ' のプレミアムを乗せた公開買付を表明した。買付総額 ' + money(t.price) + '。</p>' +
      '<p class="tiny">PBR ' + S.pbr.toFixed(2) + ' 倍・株主信任 ' + Math.round(S.trust) +
      '。市場は当社を「解体したほうが価値がある会社」と見ている。<strong>防衛に失敗すれば当社は消滅する。</strong></p>' +
      '<h3>防衛策</h3>' +
      '<div class="mbtns" style="flex-direction:column;gap:8px">' +
      '<button data-def="buyback">自社株買いで対抗（' + money(E.defendCost()) + '・現金 ' + money(S.cash) + '）</button>' +
      '<button data-def="white">ホワイトナイトを招く（株式24%を渡す／成功率86%）</button>' +
      '<button data-def="explain">株主に説明する（信任 ' + Math.round(S.trust) + ' 次第・無償）</button>' +
      '</div>', true);
  }

  function endModal(win) {
    const S = E.S;
    onClose = null;
    modal('<div class="evt-ic">' + (win ? '👑' : S.overReason === 'tob' ? '⚔️'
        : S.overReason === 'ousted' ? '🚪' : '💀') + '</div>' +
      '<h2 style="text-align:center">' + (win ? '世界最大の総合商社'
        : S.overReason === 'tob' ? '被買収' : S.overReason === 'ousted' ? '社長解任' : '経営破綻') + '</h2>' +
      '<p style="text-align:center;margin-top:8px">' +
      (win ? esc(S.company) + ' は世界の頂点に立った。<br>ラーメンから航空機まで、地球上のあらゆる商いが<br>この会社を通っている。'
           : S.overReason === 'tob'
             ? esc(S.company) + ' は敵対的買収に屈した。<br>看板は下ろされ、事業は切り売りされていく。'
             : S.overReason === 'ousted'
               ? esc(S.company) + ' は残る。<br>ただし、あなたはもうその経営者ではない。'
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
    amountModal: amountModal, eventModal: eventModal,
    fyOpen: fyOpen, fyAlloc: fyAlloc, fyNav: fyNav, fyTier: fyTier, fyCard: fyCard,
    fyGrad: fyGrad, fyPromo: fyPromo, fyGradPol: fyGradPol, setBand: setBand,
    personCard: personCard, personModal: personModal, setAdminSub: setAdminSub,
    maOpen: maOpen, maDraw: maDraw, tobModal: tobModal,
    setOffer: function (i) { curOffer = i; maDraw(); },
    promoteModal: promoteModal, endModal: endModal,
    setStance: function (i) { curStance = i; drawDeal(); },
    esc: esc,
  };
})();

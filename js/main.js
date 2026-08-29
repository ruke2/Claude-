/* =========================================================
 *  SOGO SHOSHA - bootstrap & input wiring
 * ======================================================= */
(function () {
  const D = window.GAME, E = window.ENGINE, U = window.UI;
  const $ = function (s) { return document.querySelector(s); };

  /* ---- モーダルを順番に流す ---- */
  function runQueue(items) {
    let i = 0;
    (function next() {
      if (i >= items.length) { U.render(); return; }
      const f = items[i++];
      f(next);
    })();
  }

  function startTurn() {
    const S = E.S;
    if (S.over || S.cleared) { U.endModal(S.cleared); return; }
    const out = E.advance();
    const q = [];
    if (out.event) q.push(function (n) { U.eventModal(out.event, n); });
    if (out.tob) q.push(function (n) { U.tobModal(out.tob, n); });
    if (out.fy) q.push(function (n) { U.fyOpen(out.fy, n); });
    if (out.promote) q.push(function (n) { U.promoteModal(out.promote, n, out.raise); });
    if (out.over) q.push(function () { U.endModal(false); });
    if (out.cleared) q.push(function () { U.endModal(true); });
    U.render();
    runQueue(q);
  }

  /* ---- 起動 ---- */
  function boot(state) {
    $('#title').classList.add('hide');
    $('#app').hidden = false;
    U.setTab('dash');
  }

  function newGame() {
    const name = ($('#input-company').value || '').trim() || '蒼龍商事';
    E.newGame(name);
    E.save();
    boot();
    U.alertBox('創業',
      'ようこそ、' + U.esc(E.S.company) + ' へ。<br><br>' +
      '① <b>商談</b>タブで案件に応札し、<br>② <b>翌月へ</b>で月を進めて損益を確定、<br>' +
      '③ 稼いだ資金を<b>本社</b>で本部・人員・拠点へ再投資する。<br><br>' +
      'トレードの利益を<b>権益・事業投資</b>に変え、<br>市況に左右されないストック収益を積み上げるのが<br>総合商社の勝ち筋だ。', 'gold');
  }

  /* ---- イベント委譲 ---- */
  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('[data-close],[data-bid],[data-stance],[data-deal],[data-sell],[data-up],[data-office],[data-act],[data-fy],[data-alloc],[data-tier],[data-card],[data-grad],[data-promo],[data-sub],[data-person],[data-pdiv],[data-preg],[data-phead],[data-hire],[data-ma],[data-offer],[data-dd],[data-buy],[data-pmi],[data-setpmi],[data-exit],[data-exitok],[data-def],#tabs button,#btn-next,#btn-start,#btn-continue');
    if (!t) return;

    /* --- タイトル --- */
    if (t.id === 'btn-start') { newGame(); return; }
    if (t.id === 'btn-continue') {
      if (E.load()) { boot(); U.render(); }
      else U.alertBox('データなし', 'セーブデータが見つからなかった。', 'down');
      return;
    }

    /* --- モーダル --- */
    if (t.hasAttribute('data-close')) { U.closeModal(); U.render(); return; }
    if (t.hasAttribute('data-stance')) { U.setStance(+t.dataset.stance); return; }
    if (t.hasAttribute('data-bid')) {
      const res = E.bid(t.dataset.bid, currentStance());
      E.save();
      U.bidResult(res);
      return;
    }
    if (t.hasAttribute('data-fy')) { U.fyNav(t.dataset.fy); return; }
    if (t.hasAttribute('data-alloc')) { U.fyAlloc(t.dataset.alloc, +t.dataset.d); return; }
    if (t.hasAttribute('data-tier')) { U.fyTier(t.dataset.tier, +t.dataset.i); return; }
    if (t.hasAttribute('data-card')) { U.fyCard(t.dataset.card); return; }
    if (t.hasAttribute('data-grad')) { U.fyGrad(+t.dataset.grad); return; }
    if (t.hasAttribute('data-promo')) { U.fyPromo(t.dataset.promo); return; }
    if (t.hasAttribute('data-sub')) { U.setAdminSub(t.dataset.sub); return; }
    if (t.hasAttribute('data-person')) { U.personModal(t.dataset.person); return; }
    if (t.hasAttribute('data-ma')) { U.maOpen(t.dataset.ma); return; }
    if (t.hasAttribute('data-offer')) { U.setOffer(+t.dataset.offer); return; }
    if (t.hasAttribute('data-dd')) {
      const r = E.runDD(t.dataset.dd);
      if (!r.ok) U.alertBox('実施できない', r.msg, 'down'); else U.maDraw();
      U.render();
      return;
    }
    if (t.hasAttribute('data-buy')) {
      const r = E.acquire(t.dataset.buy, currentOffer());
      U.closeModal();
      if (!r.ok) U.alertBox('提案できない', r.msg, 'down');
      else if (r.won) U.alertBox('買収成立',
        '「' + U.esc(r.target.name) + '」を ' + E.money(r.price) + ' で取得した。<br>' +
        'のれん ' + E.money(r.goodwill) + ' を計上。<br><br>' +
        (r.surprise > 0 ? '<span class="down">DDを省いたツケで、' + E.money(r.surprise) + ' の簿外債務が発覚した。</span><br><br>' : '') +
        'これから12ヶ月の<b>統合（PMI）</b>に入る。投資タブで統合責任者を指名せよ。', 'up');
      else U.alertBox('競り負け', '「' + U.esc(r.target.name) + '」は他社に取られた。<br>成約確度は ' + Math.round(r.prob * 100) + '% だった。', 'down');
      U.render();
      return;
    }
    if (t.hasAttribute('data-pmi')) {
      const aid = t.dataset.pmi;
      const cands = E.S.people.slice().sort(function (a, b) { return b.lead - a.lead; }).slice(0, 8);
      let h = '<h2>統合責任者の指名</h2><p>統率の高い幹部を送り込むほど統合の成功率が上がる。' +
        '「PMIの鬼」を持つ人材がいれば最優先だ。</p>';
      if (!cands.length) h += '<div class="empty">送り込める幹部がいない。</div>';
      cands.forEach(function (p) { h += U.personCard(p, 'data-setpmi="' + aid + '" data-p="' + p.id + '"'); });
      h += '<div class="mbtns"><button data-close>閉じる</button></div>';
      U.modal(h);
      return;
    }
    if (t.hasAttribute('data-setpmi')) {
      E.setPMILeader(t.dataset.setpmi, t.dataset.p);
      U.closeModal(); U.render();
      return;
    }
    if (t.hasAttribute('data-exit')) {
      const a = E.S.assets.filter(function (x) { return x.id === t.dataset.exit; })[0];
      if (!a) return;
      U.modal('<h2>事業会社の売却</h2><p>「' + U.esc(a.name) + '」を売却する。<br>' +
        '育てた会社を高値で手放すのは、商社の本来の稼ぎ方でもある。<br><br>' +
        '現在価値 ' + E.money(a.value) + '／シナジー ×' + (1 + a.synergy * 0.55).toFixed(2) + '</p>' +
        '<div class="mbtns"><button data-close>やめる</button>' +
        '<button class="pri" data-exitok="' + a.id + '">売却する</button></div>');
      return;
    }
    if (t.hasAttribute('data-exitok')) {
      const r = E.exitCompany(t.dataset.exitok);
      U.closeModal();
      if (!r.ok) U.alertBox('売却できない', r.msg, 'down');
      else U.alertBox('EXIT', E.money(r.proceeds) + ' で売却した。', 'up');
      U.render();
      return;
    }
    if (t.hasAttribute('data-def')) {
      const r = E.defendTOB(t.dataset.def);
      if (!r.ok) { U.alertBox('実行できない', r.msg, 'down'); return; }
      U.closeModal();
      if (r.defended) U.alertBox('防衛成功', r.msg, 'up');
      else U.endModal(false);
      U.render();
      return;
    }
    if (t.hasAttribute('data-pdiv')) { E.assignDiv(t.dataset.pdiv, t.dataset.v); U.personModal(t.dataset.pdiv); U.render(); return; }
    if (t.hasAttribute('data-preg')) { E.dispatchTo(t.dataset.preg, t.dataset.v || null); U.personModal(t.dataset.preg); U.render(); return; }
    if (t.hasAttribute('data-phead')) {
      const r = E.appointHead(t.dataset.phead);
      if (!r.ok) U.alertBox('任命できない', r.msg, 'down'); else { U.closeModal(); U.render(); }
      return;
    }

    /* --- タブ --- */
    if (t.closest('#tabs')) { U.setTab(t.dataset.tab); return; }
    if (t.id === 'btn-next') { startTurn(); return; }

    /* --- 一覧操作 --- */
    if (t.hasAttribute('data-deal')) { U.openDeal(t.dataset.deal); return; }
    if (t.hasAttribute('data-sell')) {
      const a = E.S.assets.find(function (x) { return x.id === t.dataset.sell; });
      if (!a) return;
      U.modal('<h2>資産の売却</h2><p>「' + U.esc(a.name) + '」を売却する。<br>' +
        '簿価 ' + E.money(a.value) + ' 前後で現金化できるが、将来の配当収入を失う。</p>' +
        '<div class="mbtns"><button data-close>やめる</button>' +
        '<button class="pri" data-act="sell-ok" data-id="' + a.id + '">売却する</button></div>');
      return;
    }
    if (t.hasAttribute('data-up')) {
      const r = E.upgrade(t.dataset.up);
      if (!r.ok) U.alertBox('投資できない', r.msg, 'down'); else { E.save(); U.render(); }
      return;
    }
    if (t.hasAttribute('data-office')) {
      const r = E.openOffice(t.dataset.office);
      if (!r.ok) U.alertBox('開設できない', r.msg, 'down'); else { E.save(); U.render(); }
      return;
    }

    /* --- 本社アクション --- */
    const act = t.dataset.act;
    if (act === 'sell-ok') { E.sellAsset(t.dataset.id); E.save(); U.closeModal(); U.render(); return; }
    if (act === 'career') {
      const cs = E.careerCandidates();
      window.__cands = cs;
      let h = '<h2>キャリア採用</h2><p>3名の候補から1名を選ぶ。採用コスト ' + E.money(E.careerCost()) + '。</p>';
      cs.forEach(function (p, i) {
        h += U.personCard(p, 'data-hire="' + i + '"');
      });
      h += '<div class="mbtns"><button data-close>見送る</button></div>';
      U.modal(h);
      return;
    }
    if (t.hasAttribute('data-hire')) {
      const p = (window.__cands || [])[+t.dataset.hire];
      if (!p) return;
      const r = E.hireCareer(p);
      if (!r.ok) U.alertBox('採用できない', r.msg, 'down');
      else { U.closeModal(); U.alertBox('入社', U.esc(p.name) + ' が入社した。<br>「' + E.toneOf(p).join + '」', 'up'); }
      U.render();
      return;
    }
    if (act === 'hunt') {
      const r = E.headhunt();
      if (!r.ok) { U.alertBox('実行できない', r.msg, 'down'); return; }
      if (r.won) U.alertBox('引き抜き成功', r.person.face + ' ' + U.esc(r.person.name) + '（' + r.person.age + '）が移籍を決めた。<br>「' + E.toneOf(r.person).join + '」', 'up');
      else U.alertBox('不調', 'ヘッドハントは実らなかった。<br>業界に話が漏れ、体裁が悪い。（成功率 ' + Math.round(r.prob * 100) + '%）', 'down');
      U.render();
      return;
    }
    if (act === 'hire') {
      const r = E.hire();
      if (!r.ok) U.alertBox('採用できない', r.msg, 'down'); else { E.save(); U.render(); }
      return;
    }
    if (act === 'borrow') {
      U.amountModal('銀行借入', '格付 ' + E.rating().label + ' に基づく借入枠は ' + E.money(E.borrowLimit()) +
        '。年利 ' + E.pct(E.interestRate(), 2) + ' の利息が毎月発生する。',
        E.borrowLimit(), function (v) { E.borrow(v); E.save(); });
      return;
    }
    if (act === 'repay') {
      U.amountModal('繰上返済', '有利子負債 ' + E.money(E.S.debt) + ' を返済し、財務体質と信用力を改善する。',
        Math.min(E.S.debt, E.S.cash), function (v) { E.repay(v); E.save(); });
      return;
    }
    if (act === 'reset') {
      U.modal('<h2>やり直す</h2><p>現在の会社を清算し、最初から始める。<br>この操作は取り消せない。</p>' +
        '<div class="mbtns"><button data-close>やめる</button>' +
        '<button class="pri" data-act="reset-ok">清算する</button></div>');
      return;
    }
    if (act === 'reset-ok') {
      E.wipe();
      U.closeModal();
      $('#app').hidden = true;
      $('#title').classList.remove('hide');
      $('#btn-continue').hidden = true;
      return;
    }
  });

  function currentOffer() {
    const on = document.querySelector('.aggr button.on[data-offer]');
    return on ? +on.dataset.offer : 2;
  }
  function currentStance() {
    const on = document.querySelector('.aggr button.on');
    return on ? +on.dataset.stance : 2;
  }

  /* 背景タップで閉じる（決算・終局は除く） */
  document.addEventListener('click', function (ev) {
    if (ev.target.classList.contains('backdrop')) {
      const box = $('#modal-box');
      if (box.querySelector('[data-fy]') || box.querySelector('[data-act="reset"]') ||
          box.querySelector('[data-def]')) return;
      U.closeModal(); U.render();
    }
  });

  /* ---- 初期表示 ---- */
  if (E.hasSave()) $('#btn-continue').hidden = false;
})();

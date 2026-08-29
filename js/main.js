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
    if (out.fy) q.push(function (n) { fyPending = n; U.fyModal(out.fy); });
    if (out.promote) q.push(function (n) { U.promoteModal(out.promote, n); });
    if (out.over) q.push(function () { U.endModal(false); });
    if (out.cleared) q.push(function () { U.endModal(true); });
    U.render();
    runQueue(q);
  }
  let fyPending = null;

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
    const t = ev.target.closest('[data-close],[data-bid],[data-stance],[data-deal],[data-sell],[data-up],[data-office],[data-act],[data-payout],#tabs button,#btn-next,#btn-start,#btn-continue');
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
    if (t.hasAttribute('data-payout')) {
      E.payout(t.dataset.payout);
      U.closeModal();
      const n = fyPending; fyPending = null;
      U.render();
      if (n) n();
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

  function currentStance() {
    const on = document.querySelector('.aggr button.on');
    return on ? +on.dataset.stance : 2;
  }

  /* 背景タップで閉じる（決算・終局は除く） */
  document.addEventListener('click', function (ev) {
    if (ev.target.classList.contains('backdrop')) {
      const box = $('#modal-box');
      if (box.querySelector('[data-payout]') || box.querySelector('[data-act="reset"]')) return;
      U.closeModal(); U.render();
    }
  });

  /* ---- 初期表示 ---- */
  if (E.hasSave()) $('#btn-continue').hidden = false;
})();

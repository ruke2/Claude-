// ============================================================
//  財務パネル — PL / BS / 指標 / 資金調達
// ============================================================
import { money, num, pct, dcls, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty, openModal, closeModal, toast } from './dom.js';
import { kpis, ttm, buildBS, borrow, repay, ipoStatus, doIPO, issueShares, debtCapacity, effectiveRate, RATINGS, sharePrice, marketCap, unrealizedGain, overdraft } from '../sim/finance.js';
import { DISTRICTS, USES } from '../data/city.js';
import { currentNOI } from '../sim/valuation.js';
import { FUND_TYPES, typeOf, canForm, formFund, contribute, contributable, fundPrice,
  fundAUM, fundNOI, fundFee, fundDividend, fundEquityOf, fundSummary, shareNow,
  externalAUM, EXTERNAL_CAP } from '../sim/fund.js';

export const title = '財務';

/**
 * REIT・私募ファンド。
 * 数字はすべて `sim/fund.js` から引く。**ここで計算し直さないこと。**
 */
function fundSection(g) {
  const fs = fundSummary(g);
  const active = (g.funds || []).filter(f => f.status === 'active');
  const closed = (g.funds || []).filter(f => f.status === 'closed');
  const pool = contributable(g);
  const poolNoi = pool.reduce((a, x) => a + currentNOI(g, x), 0);

  const cards = active.map(f => {
    const t = typeOf(f.type);
    const aum = fundAUM(f), ext = externalAUM(f);
    const room = Math.max(0, (f.contributed || 0) * EXTERNAL_CAP - ext);
    const years = f.endWeek ? Math.max(0, (f.endWeek - g.week) / 52) : 0;
    return `<div class="card click" data-act="fund.open" data-id="${f.id}">
      <div class="card-t"><span class="card-n">${t.icon} ${f.name}</span>
        ${chip(t.name, f.type === 'reit' ? 'gold' : 'cyan')}
        ${f.endWeek ? chip(`残り ${years.toFixed(1)}年`, years < 1.5 ? 'amber' : 'grey') : chip('無期限', 'grey')}</div>
      <div class="card-s">自社が拠出 ${f.assets.filter(x => !x.external).length}物件／第三者取得 ${money(ext)}</div>
      ${kv('運用資産（AUM）', money(aum))}
      ${kv('年間の運用報酬', money(fundFee(g, f)))}
      ${kv('年間の配当（持分 ' + pct(shareNow(g, f), 1) + '）', money(fundDividend(g, f)))}
      ${kv('出資持分（簿価）', money(fundEquityOf(f)))}
      ${kv('これまでの報酬＋配当', money((f.cumFee || 0) + (f.cumDiv || 0)))}
      <div class="hint">${room > 2000
      ? `第三者からあと ${money(room)} まで取得できる。自社が拠出するほど、投資家の資金も付いてくる。`
      : '第三者からの取得枠は埋まっている。自社の物件を追加拠出すると枠が広がる。'}</div>
    </div>`;
  }).join('');

  const forms = Object.values(FUND_TYPES).map(t => {
    const err = canForm(g, t.id, pool);
    return `<div class="card ${err ? '' : 'click'}" ${err ? '' : `data-act="fund.form" data-id="${t.id}"`}>
      <div class="card-t"><span class="card-n">${t.icon} ${t.name}を組成する</span>
        ${chip(`自社出資 ${pct(t.myShare, 0)}`, 'grey')}</div>
      <div class="card-s">${t.desc}</div>
      ${kv('運用報酬', `年 ${pct(t.fee, 2)}（運用資産に対して）`)}
      ${kv('取得報酬', `${pct(t.acqFee, 1)}（取得価格に対して・1回きり）`)}
      ${kv('借入比率', pct(t.ltv, 0))}
      ${kv('運用期間', t.years ? `${t.years}年` : '無期限')}
      <div class="hint" ${err ? 'style="color:var(--red)"' : ''}>${err
      || `いまの保有物件（${pool.length}棟）から選んで拠出できる。`}</div>
    </div>`;
  }).join('');

  return section('REIT・私募ファンド', active.length ? `運用資産 ${money(fs.aum)}` : '', `
    <div class="hint" style="margin-bottom:10px">
      保有物件を自社が組成したファンドに売ると、物件は貸借対照表から外れ、
      かわりに<b>運用報酬と出資持分の配当</b>が入り続ける。
      売った時点で含み益が実現益になり、現金も戻る。<br>
      <b>賃貸NOIそのものは失う。</b>持ち続けるより儲かる仕組みではなく、
      資金を回して次を建てるための道具である。
    </div>
    ${active.length ? `<div class="grid4">
      ${mini('運用資産', money(fs.aum, { unit: false }), moneyUnit(fs.aum))}
      ${mini('うち第三者取得', money(fs.external, { unit: false }), moneyUnit(fs.external))}
      ${mini('年間の報酬＋配当', money(fs.fee + fs.div, { unit: false }), moneyUnit(fs.fee + fs.div))}
      ${mini('累計の報酬＋配当', money(fs.cum, { unit: false }), moneyUnit(fs.cum))}
    </div>` : ''}
    ${cards}
    ${forms}
    ${pool.length ? `<div class="hint">拠出できる物件は ${pool.length}棟（年間NOI ${money(poolNoi)}）。
      出せばこのNOIを手放すことになる。</div>` : ''}
    ${closed.length ? `<div class="hint">解散したファンド：${closed.map(f => `${f.name}（累計 ${money((f.cumFee || 0) + (f.cumDiv || 0))}）`).join('／')}</div>` : ''}
  `);
}

export function render(g, ctx) {
  const k = kpis(g);
  const t = ttm(g);
  const h = g.finance.history;
  const pl = g.finance.pl;
  const bs = g.finance.bs || buildBS(g);
  const ipo = ipoStatus(g);
  const od = overdraft(g);

  const plRow = (label, v, opt = {}) => `<tr class="${opt.sum ? 'sum' : ''}">
    <td>${label}</td><td>${money(v)}</td><td>${t.revenue > 0 && opt.ratio !== false ? pct(v / (opt.base ?? t.revenue), 1) : ''}</td></tr>`;

  const plTable = pl ? `
    <table class="tbl">
      <tr><th>科目</th><th>直近四半期</th><th>売上比</th></tr>
      <tr><td>売上高</td><td>${money(pl.revenue)}</td><td>100.0%</td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">分譲事業</td><td>${money(pl.revSale)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">賃貸事業</td><td>${money(pl.revLease)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">管理受託・フィー</td><td>${money(pl.revFee)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">子会社・買収先（連結）</td><td>${money(pl.revOther !== undefined ? pl.revOther : pl.revenue - pl.revSale - pl.revLease - pl.revFee)}</td><td></td></tr>
      <tr><td>売上原価</td><td>${money(-pl.cogs)}</td><td>${pct(pl.cogs / Math.max(1, pl.revenue))}</td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">分譲原価</td><td>${money(-pl.cogsSale)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">賃貸原価・減価償却</td><td>${money(-pl.cogsLease)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">用地保有コスト・連結原価</td><td>${money(-pl.cogsOther)}</td><td></td></tr>
      <tr class="sum"><td>売上総利益</td><td>${money(pl.gross)}</td><td>${pct(pl.gross / Math.max(1, pl.revenue))}</td></tr>
      <tr><td>販売費及び一般管理費</td><td>${money(-pl.sga)}</td><td></td></tr>
      <tr><td style="padding-left:16px;color:var(--ink-dim)">人件費</td><td>${money(-pl.personnel)}</td><td></td></tr>
      <tr class="sum"><td>営業利益</td><td><b class="${dcls(pl.op)}">${money(pl.op)}</b></td><td>${pct(pl.op / Math.max(1, pl.revenue))}</td></tr>
      <tr><td>支払利息</td><td>${money(-pl.interest)}</td><td></td></tr>
      <tr class="sum"><td>経常利益</td><td>${money(pl.ordinary)}</td><td></td></tr>
      ${pl.gainSale ? `<tr><td>固定資産売却益</td><td>${money(pl.gainSale)}</td><td></td></tr>` : ''}
      ${pl.impairment ? `<tr><td>減損損失・評価損</td><td class="down">${money(-pl.impairment)}</td><td></td></tr>` : ''}
      ${pl.extra - pl.gainSale + pl.impairment !== 0 ? `<tr><td>その他特別損益</td><td>${money(pl.extra - pl.gainSale + pl.impairment)}</td><td></td></tr>` : ''}
      <tr><td>法人税等</td><td>${money(-pl.tax)}</td><td></td></tr>
      <tr class="sum"><td>当期純利益</td><td><b class="${dcls(pl.net)}">${money(pl.net)}</b></td><td>${pct(pl.net / Math.max(1, pl.revenue))}</td></tr>
    </table>` : empty('まだ決算は確定していない');

  const bsTable = `
    <table class="tbl">
      <tr><th>資産の部</th><th>金額</th><th>構成比</th></tr>
      <tr><td>現金及び預金</td><td>${money(bs.cash)}</td><td>${pct(bs.cash / bs.total, 0)}</td></tr>
      <tr><td>販売用不動産（在庫）</td><td>${money(bs.inventory)}</td><td>${pct(bs.inventory / bs.total, 0)}</td></tr>
      <tr><td>仕掛用地</td><td>${money(bs.land)}</td><td>${pct(bs.land / bs.total, 0)}</td></tr>
      <tr><td>建設仮勘定</td><td>${money(bs.cip)}</td><td>${pct(bs.cip / bs.total, 0)}</td></tr>
      <tr><td>賃貸等不動産</td><td>${money(bs.rental)}</td><td>${pct(bs.rental / bs.total, 0)}</td></tr>
      <tr><td>本社不動産</td><td>${money(bs.hq)}</td><td>${pct(bs.hq / bs.total, 0)}</td></tr>
      ${bs.goodwill ? `<tr><td>のれん</td><td>${money(bs.goodwill)}</td><td>${pct(bs.goodwill / bs.total, 0)}</td></tr>` : ''}
      ${bs.subs ? `<tr><td>子会社出資金</td><td>${money(bs.subs)}</td><td>${pct(bs.subs / bs.total, 0)}</td></tr>` : ''}
      ${bs.fund ? `<tr><td>ファンド出資金</td><td>${money(bs.fund)}</td><td>${pct(bs.fund / bs.total, 0)}</td></tr>` : ''}
      <tr class="sum"><td>資産合計</td><td>${money(bs.total)}</td><td>100%</td></tr>
      <tr><th>負債・純資産の部</th><th></th><th></th></tr>
      <tr><td>有利子負債</td><td>${money(bs.debt)}</td><td>${pct(bs.debt / bs.total, 0)}</td></tr>
      <tr class="sum"><td>純資産</td><td>${money(bs.equity)}</td><td>${pct(bs.equity / bs.total, 0)}</td></tr>
    </table>
    <div class="hint">保有不動産の含み益 <b class="${dcls(k.unrealized.gain)}">${money(k.unrealized.gain, { sign: true })}</b>（時価 ${money(k.unrealized.mv)} ／ 簿価 ${money(k.unrealized.bv)}）。含み益は簿価会計上のBSには表れないが、企業価値に反映される。</div>`;

  const hist = h.slice(-10);
  const histTable = hist.length ? `
    <table class="tbl">
      <tr><th>期</th><th>売上高</th><th>営業利益</th><th>純利益</th><th>純資産</th><th>格付</th></tr>
      ${hist.slice().reverse().map(x => `<tr>
        <td>${x.year}年Q${x.q}</td><td>${money(x.pl.revenue)}</td>
        <td class="${dcls(x.pl.op)}">${money(x.pl.op)}</td>
        <td class="${dcls(x.pl.net)}">${money(x.pl.net)}</td>
        <td>${money(x.bs.equity)}</td><td>${x.rating}</td></tr>`).join('')}
    </table>` : '';

  return `
  ${section('経営指標', '直近4四半期', `
    <div class="grid4">
      ${mini('売上高', money(t.revenue, { unit: false }), moneyUnit(t.revenue))}
      ${mini('営業利益率', pct(k.opMargin), '', k.opMargin > 0.1 ? 'var(--green)' : k.opMargin < 0 ? 'var(--red)' : '')}
      ${mini('ROE', pct(k.roe), '', k.roe > 0.08 ? 'var(--gold)' : '')}
      ${mini('自己資本比率', pct(k.equityRatio), `D/E ${k.de.toFixed(2)}倍`)}
    </div>
    <div style="margin-top:12px">${spark(h.slice(-16).map(x => x.pl.op), { color: '#0f8a55', zero: true })}</div>
    <div class="hint">営業利益の推移（直近16四半期）</div>
  `)}

  ${section('資金調達', `格付 ${k.rating.id}（${k.rating.label}）`, `
    <div class="grid3">
      ${mini('現預金', money(g.cash, { unit: false }), moneyUnit(g.cash))}
      ${mini('有利子負債', money(g.debt, { unit: false }), moneyUnit(g.debt))}
      ${mini('調達余力', money(k.room, { unit: false }), moneyUnit(k.room), k.room <= 0 ? 'var(--red)' : '')}
    </div>
    ${od > 0 ? `<div class="card" style="border-color:rgba(255,107,122,.5);margin-top:10px">
      <div class="card-t"><span class="card-n" style="color:var(--red)">⚠ 借入枠を超過している</span></div>
      <div class="card-s">超過額 ${money(od)}。ペナルティ金利がかかっており、この状態が3四半期続くと支払不能となる。資産売却か増資で資金を作ること。</div>
    </div>` : ''}
    <div class="card" style="margin-top:10px">
      ${kv('適用金利', pct(k.rate, 2))}
      ${kv('年間の支払利息（概算）', money(Math.round(g.debt * k.rate)))}
      ${kv('借入可能上限', money(k.capacity))}
      <div class="hint">借入枠は「純資産 × レバレッジ倍率 ＋ 保有不動産の担保価値」で決まる。財務経理部の能力が高いほど枠が広がる。</div>
    </div>
    <div class="btnrow">
      <button class="btn" data-act="fin.borrow">借り入れる</button>
      <button class="btn" data-act="fin.repay">返済する</button>
      ${g.company.listed ? `<button class="btn" data-act="fin.issue">公募増資</button>` : `<button class="btn primary" data-act="fin.ipo">株式上場（IPO）</button>`}
    </div>
    ${!g.company.listed ? `<div class="card" style="margin-top:10px">
      <div class="card-t"><span class="card-n">上場要件</span>${chip(ipo.ok ? '充足' : '未充足', ipo.ok ? 'green' : 'grey')}</div>
      ${(ipo.reqs || []).map(r => `<div class="kv"><span class="k">${r.ok ? '✅' : '⬜'} ${r.label}</span><span class="v">${r.now}</span></div>`).join('')}
    </div>` : `<div class="grid3" style="margin-top:10px">
      ${mini('株価', num(k.price) + '円')}
      ${mini('時価総額', money(k.cap, { unit: false }), moneyUnit(k.cap))}
      ${mini('PBR', (k.price / Math.max(1, k.bps)).toFixed(2) + '倍', `EPS ${num(k.eps, 0)}円`)}
    </div>`}
  `)}

  ${fundSection(g)}
  ${section('損益計算書', pl ? `${g.year}年 第${g.quarter}四半期` : '', plTable)}
  ${section('貸借対照表', '', bsTable)}
  ${section('業績推移', '', histTable)}
  `;
}

export function openBorrow(g, ctx, mode) {
  const k = kpis(g);
  const max = mode === 'borrow' ? k.room : Math.min(g.debt, g.cash);
  openModal(mode === 'borrow' ? '借入' : '返済', `
    <div class="card">
      ${kv('現預金', money(g.cash))}
      ${kv('有利子負債', money(g.debt))}
      ${kv(mode === 'borrow' ? '調達余力' : '返済可能額', money(max))}
      ${kv('適用金利', pct(k.rate, 2))}
    </div>
    <div class="field" style="margin-top:12px">
      <label>金額（億円）</label>
      <input type="number" id="inpAmt" value="${Math.max(0, Math.round(max / 100 / 2))}" step="10" min="0" max="${Math.round(max / 100)}">
    </div>
    <div class="hint">${mode === 'borrow' ? '借入は資金効率を高めるが、金利負担と財務リスクを伴う。自己資本比率が下がると格付けが落ち、金利が上がる。' : '返済すると金利負担が軽くなり、格付けも改善する。'}</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: mode === 'borrow' ? '借り入れる' : '返済する', cls: 'primary', onClick: () => {
        const v = Math.round((+document.getElementById('inpAmt').value) * 100);
        if (v <= 0) return;
        if (mode === 'borrow') borrow(g, v, g.news); else repay(g, v, g.news);
        toast(mode === 'borrow' ? `${money(v)}を借り入れた` : `${money(v)}を返済した`);
        ctx.refresh();
      }
    },
  ]);
}

export function openIPO(g, ctx) {
  const s = ipoStatus(g);
  const price = Math.round(sharePrice(g) * 0.88);
  const shares = Math.round(g.company.shares * 0.28);
  openModal('株式上場（IPO）', `
    <div class="card">
      <div class="card-t"><span class="card-n">上場要件</span>${chip(s.ok ? '充足' : '未充足', s.ok ? 'green' : 'red')}</div>
      ${(s.reqs || []).map(r => `<div class="kv"><span class="k">${r.ok ? '✅' : '⬜'} ${r.label}</span><span class="v">${r.now}</span></div>`).join('')}
    </div>
    <div class="card">
      ${kv('想定公開価格', num(price) + '円')}
      ${kv('公募株数', num(shares) + '株')}
      ${kv('調達見込額', money(Math.round(price * shares / 1e6)))}
      ${kv('希薄化', '28%')}
    </div>
    <div class="hint">上場すれば資金調達力が大幅に高まり、企業ブランドも上がる。一方で株主の目が厳しくなり、競合から買収提案を受ける可能性も生じる。</div>
  `, [
    { label: 'まだ見送る', cls: 'ghost' },
    {
      label: '上場する', cls: 'primary', disabled: !s.ok, onClick: () => {
        const r = doIPO(g, g.news);
        toast(`上場を果たした。${money(r)}を調達`, 'good');
        ctx.refresh();
      }
    },
  ]);
}

export function openIssue(g, ctx) {
  openModal('公募増資', `
    <div class="card">
      ${kv('現在の株価', num(sharePrice(g)) + '円')}
      ${kv('発行済株式数', num(g.company.shares) + '株')}
      ${kv('時価総額', money(marketCap(g)))}
    </div>
    <div class="field" style="margin-top:12px">
      <label>希薄化率（%）</label>
      <input type="number" id="inpAmt" value="10" step="1" min="1" max="40">
    </div>
    <div class="hint">増資は返済不要の資金だが、1株あたり利益が薄まり株価が下がりやすい。自己資本比率が改善するため格付けには有利に働く。</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '増資する', cls: 'primary', onClick: () => {
        const r = (+document.getElementById('inpAmt').value) / 100;
        const got = issueShares(g, r, g.news);
        toast(`${money(got)}を調達した`);
        ctx.refresh();
      }
    },
  ]);
}

// ------------------------------------------------------------
//  ファンドの組成と追加拠出
//    どちらも「どの物件を出すか」を選ぶ画面である。
//    **失うもの（年間NOI）を必ず一緒に出すこと。**
//    入ってくる現金だけを見せると、出すのが常に得に見える。
// ------------------------------------------------------------

/** 物件を選んでファンドを組成する */
export function openFundForm(g, typeId, ctx) {
  const t = typeOf(typeId);
  const pool = contributable(g).slice().sort((a, b) => b.age - a.age);
  const sel = new Set();

  draw();

  function draw() {
    // 物件を選ぶたびに描き直すので、**スクロール位置を戻さないこと。**
    // 一覧の下のほうを選んでいる最中に先頭へ飛ぶと、選び進められない
    const el0 = document.getElementById('modalBody');
    const sc = el0 ? el0.scrollTop : 0;
    openModal(`${t.icon} ${t.name}の組成`, build(), buttons());
    const el = document.getElementById('modalBody');
    if (el) el.scrollTop = sc;
    bind();
  }

  function picked() { return pool.filter(a => sel.has(a.id)); }

  function buttons() {
    const list = picked();
    const err = canForm(g, typeId, list);
    return [
      {
        label: '組成する', cls: 'primary', disabled: !!err, close: false,
        onClick: () => {
          const r = formFund(g, typeId, picked(), ctx.rng, null);
          if (!r.ok) return toast(r.message, 'bad');
          closeModal();
          toast(`${r.fund.name}を組成した（${money(r.cash)}を回収）`, 'good');
          ctx.refresh();
        },
      },
      { label: '閉じる', cls: 'ghost' },
    ];
  }

  function build() {
    const list = picked();
    const price = list.reduce((s, a) => s + fundPrice(g, a, typeId), 0);
    const book = list.reduce((s, a) => s + (a.bookLand || 0) + (a.bookBuild || 0), 0);
    const noi = list.reduce((s, a) => s + currentNOI(g, a), 0);
    const myEq = Math.round(price * (1 - t.ltv) * t.myShare);
    const err = canForm(g, typeId, list);

    return `
    <div class="grid2">
      ${mini('拠出額', money(price, { unit: false }), moneyUnit(price))}
      ${mini('戻る現金', money(price - myEq, { unit: false }), '拠出額 − 自社の出資')}
      ${mini('売却損益', money(price - book, { sign: true, unit: false }), `簿価 ${money(book)}`)}
      ${mini('手放す年間NOI', money(noi, { unit: false }), moneyUnit(noi), 'var(--red)')}
    </div>

    <div class="sec">
      <div class="sec-t"><span>組成後に入ってくるもの</span></div>
      ${kv('取得報酬（1回きり）', money(Math.round(price * t.acqFee)))}
      ${kv('年間の運用報酬', money(Math.round(price * t.fee)))}
      ${kv('自社の出資持分', `${money(myEq)}（出資部分の ${pct(t.myShare, 0)}）`)}
      ${kv('運用期間', t.years ? `${t.years}年（満了で解散し、持分ぶんが戻る）` : '無期限')}
      <div class="hint">手放す年間NOI ${money(noi)} に対し、報酬と配当で戻るのは年 ${money(Math.round(price * t.fee))} 前後である。
        <b>ファンドは儲けを増やす道具ではなく、資金を回して次を建てるための道具である。</b>
        第三者からの取得が進めば運用資産が増え、報酬はそのぶん伸びる。</div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>拠出する物件を選ぶ</span>
        <span class="note">${list.length} / ${pool.length}棟（最低 ${t.minAssets}棟・${money(t.minValue)}）</span></div>
      <div class="card" style="margin-bottom:8px">
        ${kv('拠出額', money(price))}
        ${kv('戻る現金', `<b class="up">${money(price - myEq)}</b>`)}
        ${kv('手放す年間NOI', `<b class="down">${money(noi)}</b>`)}
      </div>
      ${pool.length ? pool.map(a => {
      const p = fundPrice(g, a, typeId);
      const n = currentNOI(g, a);
      const on = sel.has(a.id);
      return `<div class="card ${on ? 'sel' : ''} click" data-pick="${a.id}">
          <div class="card-t"><span class="card-n">${on ? '☑' : '☐'} ${a.name}</span>
            ${chip(USES[a.use].name, 'cyan')}${chip(`築${a.age.toFixed(0)}年`, 'grey')}</div>
          <div class="card-s">${DISTRICTS[a.district].name}／貸室${num(a.nra)}坪／稼働${pct(a.occupancy, 0)}</div>
          <div class="kv"><span class="k">ファンドの買値</span><span class="v">${money(p)}</span></div>
          <div class="kv"><span class="k">簿価 / 年間NOI</span><span class="v">${money((a.bookLand || 0) + (a.bookBuild || 0))} / ${money(n)}</span></div>
        </div>`;
    }).join('') : empty('拠出できる物件がない')}
    </div>
    ${err ? `<div class="card" style="border-color:rgba(255,107,122,.4)"><div class="card-s" style="color:var(--red)">${err}</div></div>` : ''}`;
  }

  function bind() {
    for (const el of Array.from(document.querySelectorAll('[data-pick]'))) {
      el.onclick = () => {
        const id = el.dataset.pick;
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        draw();
      };
    }
  }
}

/** 既存のファンドを開く（追加拠出と中身の確認） */
export function openFund(g, fundId, ctx) {
  const f = (g.funds || []).find(x => x.id === fundId);
  if (!f) return;
  const t = typeOf(f.type);
  const pool = contributable(g).slice().sort((a, b) => b.age - a.age);
  const sel = new Set();

  draw();

  function draw() {
    const el0 = document.getElementById('modalBody');
    const sc = el0 ? el0.scrollTop : 0;
    openModal(`${t.icon} ${f.name}`, build(), buttons());
    const el = document.getElementById('modalBody');
    if (el) el.scrollTop = sc;
    bind();
  }
  function picked() { return pool.filter(a => sel.has(a.id)); }

  function buttons() {
    return [
      {
        label: '追加で拠出する', cls: 'primary', disabled: picked().length === 0, close: false,
        onClick: () => {
          const r = contribute(g, f, picked(), null);
          closeModal();
          toast(`${f.name}に${money(r.price)}を拠出した（${money(r.cash)}を回収）`, 'good');
          ctx.refresh();
        },
      },
      { label: '閉じる', cls: 'ghost' },
    ];
  }

  function build() {
    const list = picked();
    const price = list.reduce((s, a) => s + fundPrice(g, a, f.type), 0);
    const noi = list.reduce((s, a) => s + currentNOI(g, a), 0);
    const myEq = Math.round(price * (1 - t.ltv) * f.myShare);
    const aum = fundAUM(f), ext = externalAUM(f);
    const room = Math.max(0, (f.contributed || 0) * EXTERNAL_CAP - ext);
    const mine = f.assets.filter(x => !x.external);

    return `
    <div class="grid4">
      ${mini('運用資産', money(aum, { unit: false }), moneyUnit(aum))}
      ${mini('うち第三者', money(ext, { unit: false }), `あと ${money(room)} まで`)}
      ${mini('年間の報酬', money(fundFee(g, f), { unit: false }), moneyUnit(fundFee(g, f)))}
      ${mini('年間の配当', money(fundDividend(g, f), { unit: false }), `持分 ${pct(shareNow(g, f), 1)}`)}
    </div>

    <div class="sec">
      <div class="sec-t"><span>ファンドの概要</span></div>
      ${kv('種類', t.name)}
      ${kv('自社が拠出した額', money(f.contributed || 0))}
      ${kv('出資持分（簿価）', money(fundEquityOf(f)))}
      ${kv('年間NOI（ファンド全体）', money(fundNOI(g, f)))}
      ${kv('借入比率', pct(t.ltv, 0))}
      ${kv('運用期間', f.endWeek ? `${((f.endWeek - g.week) / 52).toFixed(1)}年 残り（満了で解散）` : '無期限')}
      ${kv('これまでの報酬＋配当', money((f.cumFee || 0) + (f.cumDiv || 0)))}
      <div class="hint">第三者から取得するたびに運用資産が増え、運用報酬も増える。
        そのかわり投資家の出資が入るので、<b>自社の持分比率は薄まる</b>（配当の取り分は増えない）。</div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>組み入れている物件</span><span class="note">${mine.length}物件</span></div>
      ${mine.length ? `<table class="tbl">
        <tr><th>物件</th><th>所在</th><th style="text-align:right">取得価格</th><th style="text-align:right">NOI</th></tr>
        ${mine.map(x => `<tr><td>${x.name}</td><td>${x.district ? DISTRICTS[x.district].name : '—'}</td>
          <td style="text-align:right">${money(x.price)}</td><td style="text-align:right">${money(x.noi)}</td></tr>`).join('')}
      </table>` : empty('まだ物件が無い')}
      ${ext > 0 ? `<div class="hint">ほかに第三者から取得した ${money(ext)} を組み入れている。</div>` : ''}
    </div>

    <div class="sec">
      <div class="sec-t"><span>追加で拠出する</span>
        <span class="note">${list.length}棟</span></div>
      ${list.length ? `<div class="card" style="margin-bottom:8px">
        ${kv('拠出額', money(price))}
        ${kv('戻る現金', `<b class="up">${money(price - myEq)}</b>`)}
        ${kv('手放す年間NOI', `<b class="down">${money(noi)}</b>`)}
      </div>` : ''}
      ${pool.length ? pool.map(a => {
      const p = fundPrice(g, a, f.type);
      const on = sel.has(a.id);
      return `<div class="card ${on ? 'sel' : ''} click" data-pick="${a.id}">
          <div class="card-t"><span class="card-n">${on ? '☑' : '☐'} ${a.name}</span>
            ${chip(USES[a.use].name, 'cyan')}${chip(`築${a.age.toFixed(0)}年`, 'grey')}</div>
          <div class="card-s">${DISTRICTS[a.district].name}／貸室${num(a.nra)}坪／稼働${pct(a.occupancy, 0)}</div>
          <div class="kv"><span class="k">ファンドの買値 / 年間NOI</span><span class="v">${money(p)} / ${money(currentNOI(g, a))}</span></div>
        </div>`;
    }).join('') : empty('拠出できる物件がない')}
      ${list.length ? `<div class="hint">戻る現金 <b>${money(price - myEq)}</b>／取得報酬 ${money(Math.round(price * t.acqFee))}。
        第三者からの取得枠も ${money(Math.round(price * EXTERNAL_CAP))} 広がる。</div>` : ''}
    </div>`;
  }

  function bind() {
    for (const el of Array.from(document.querySelectorAll('[data-pick]'))) {
      el.onclick = () => {
        const id = el.dataset.pick;
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        draw();
      };
    }
  }
}

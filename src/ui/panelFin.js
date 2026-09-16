// ============================================================
//  財務パネル — PL / BS / 指標 / 資金調達
// ============================================================
import { money, num, pct, dcls } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty, openModal, closeModal, toast } from './dom.js';
import { kpis, ttm, buildBS, borrow, repay, ipoStatus, doIPO, issueShares, debtCapacity, effectiveRate, RATINGS, sharePrice, marketCap, unrealizedGain, overdraft } from '../sim/finance.js';

export const title = '財務';

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
      <tr><td style="padding-left:16px;color:var(--ink-dim)">その他・連結</td><td>${money(pl.revenue - pl.revSale - pl.revLease)}</td><td></td></tr>
      <tr><td>売上原価</td><td>${money(-pl.cogs)}</td><td>${pct(pl.cogs / Math.max(1, pl.revenue))}</td></tr>
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
        <td>${x.year}Q${x.q}</td><td>${money(x.pl.revenue)}</td>
        <td class="${dcls(x.pl.op)}">${money(x.pl.op)}</td>
        <td class="${dcls(x.pl.net)}">${money(x.pl.net)}</td>
        <td>${money(x.bs.equity)}</td><td>${x.rating}</td></tr>`).join('')}
    </table>` : '';

  return `
  ${section('経営指標', '直近4四半期', `
    <div class="grid4">
      ${mini('売上高', money(t.revenue, { unit: false }), '億円')}
      ${mini('営業利益率', pct(k.opMargin), '', k.opMargin > 0.1 ? 'var(--green)' : k.opMargin < 0 ? 'var(--red)' : '')}
      ${mini('ROE', pct(k.roe), '', k.roe > 0.08 ? 'var(--gold)' : '')}
      ${mini('自己資本比率', pct(k.equityRatio), `D/E ${k.de.toFixed(2)}倍`)}
    </div>
    <div style="margin-top:12px">${spark(h.slice(-16).map(x => x.pl.op), { color: '#4ade9b', zero: true })}</div>
    <div class="hint">営業利益の推移（直近16四半期）</div>
  `)}

  ${section('資金調達', `格付 ${k.rating.id}（${k.rating.label}）`, `
    <div class="grid3">
      ${mini('現預金', money(g.cash, { unit: false }), '億円')}
      ${mini('有利子負債', money(g.debt, { unit: false }), '億円')}
      ${mini('調達余力', money(k.room, { unit: false }), '億円', k.room <= 0 ? 'var(--red)' : '')}
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
      ${mini('時価総額', money(k.cap, { unit: false }), '億円')}
      ${mini('PBR', (k.price / Math.max(1, k.bps)).toFixed(2) + '倍', `EPS ${num(k.eps, 0)}円`)}
    </div>`}
  `)}

  ${section('損益計算書', pl ? `${g.year}年 Q${g.quarter}` : '', plTable)}
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

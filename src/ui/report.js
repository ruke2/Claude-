// ============================================================
//  四半期レポート
// ============================================================
import { money, moneyHTML, num, pct, dcls } from '../core/format.js';
import { mini, kv, chip, section, empty } from './dom.js';
import { SEASON } from '../core/format.js';
import { DISTRICTS, USES } from '../data/city.js';

const CAT = {
  brand: 'ブランド', land: '用地', dev: '開発', sales: '販売', lease: '賃貸', fin: '財務',
  hr: '人事', ma: 'M&A', rival: '競合', market: '市況',
};

export function buildReport(g, rep, reports = []) {
  const h = g.finance.history;
  const prev = h.length >= 2 ? h[h.length - 2] : null;
  const pl = rep.pl;
  const d = (cur, before) => before ? (cur - before) : 0;

  const bids = (reports.length ? reports.flatMap(r => r.bids) : rep.bids).filter(b => b.listing.bid);
  const bidHTML = bids.length ? bids.map(b => {
    const c = b.cell;
    const win = b.result === 'win';
    const sorted = (b.bids || []).slice(0, 6);
    return `<div class="card" style="border-color:${win ? 'rgba(74,222,155,.4)' : 'rgba(255,107,122,.3)'}">
      <div class="card-t">
        <span class="card-n">${DISTRICTS[c.d].name}　${num(c.area)}坪</span>
        ${chip(win ? '落札' : b.result === 'fail' ? '不調' : '失注', win ? 'green' : 'red')}
      </div>
      <table class="tbl" style="margin-top:6px">
        <tr><th>入札者</th><th>金額</th>${b.listing.kind === 'proposal' ? '<th>企画評価</th>' : ''}</tr>
        ${sorted.map((x, i) => `<tr class="${x.isPlayer ? 'me' : ''}">
          <td>${i === 0 && b.result !== 'fail' ? '👑 ' : ''}${x.name}</td>
          <td>${money(x.amount)}</td>
          ${b.listing.kind === 'proposal' ? `<td>${x.quality.toFixed(0)}</td>` : ''}
        </tr>`).join('')}
      </table>
      ${win && b.second ? `<div class="hint">2位との差 ${money(b.winner.amount - b.second.amount)}（${pct((b.winner.amount - b.second.amount) / b.winner.amount, 1)}）${(b.winner.amount - b.second.amount) / b.winner.amount > 0.18 ? '　— competitorに対して払い過ぎた可能性がある' : ''}</div>` : ''}
      ${b.result === 'fail' ? `<div class="hint">売主の希望価格に達せず不調に終わった。</div>` : ''}
    </div>`;
  }).join('') : '';

  const all = rep.quarterNews || rep.news;
  const byCat = {};
  for (const n of all) (byCat[n.type] = byCat[n.type] || []).push(n);
  const newsHTML = Object.entries(byCat).map(([cat, list]) => `
    <div class="sec">
      <div class="sec-t"><span>${CAT[cat] || cat}</span><span class="note">${list.length}件</span></div>
      ${list.slice(-14).map(n => `<div class="newsitem"><span class="ico">${n.icon}</span><span>${n.text}</span></div>`).join('')}
      ${list.length > 14 ? `<div class="hint">ほか${list.length - 14}件</div>` : ''}
    </div>`).join('') || empty('特筆すべき出来事はなかった');

  const rank = rep.rank;

  return `
  <div class="rep-hero">
    ${mini('売上高', moneyHTML(pl.revenue), prev ? `前期比 ${money(d(pl.revenue, prev.pl.revenue), { sign: true })}` : '')}
    ${mini('営業利益', moneyHTML(pl.op), prev ? `前期比 ${money(d(pl.op, prev.pl.op), { sign: true })}` : '', pl.op >= 0 ? 'var(--green)' : 'var(--red)')}
    ${mini('当期純利益', moneyHTML(pl.net), pl.tax ? `法人税等 ${money(pl.tax)}` : '', pl.net >= 0 ? 'var(--green)' : 'var(--red)')}
    ${mini('純資産', moneyHTML(g.finance.bs.equity), `自己資本比率 ${pct(rep.kpi.equityRatio, 0)}`)}
  </div>

  <div class="grid3" style="margin-bottom:18px">
    ${mini('市況局面', rep.phase.name, `センチメント ${(g.market.sentiment * 100).toFixed(0)}`)}
    ${mini('業界順位', rank ? `${rank.rank}位` : '—', '売上高ベース')}
    ${mini('現預金', moneyHTML(g.cash), `有利子負債 ${money(g.debt)}`)}
  </div>

  ${rep.shocks.length ? `<div class="sec">
    <div class="sec-t"><span>市況の変化</span></div>
    ${rep.shocks.map(s => `<div class="card" style="border-color:rgba(227,181,88,.3)">
      <div class="card-t"><span class="card-n">${s.icon} ${s.title}</span></div>
      <div class="card-s">${s.text}</div></div>`).join('')}
  </div>` : ''}

  ${bidHTML ? `<div class="sec"><div class="sec-t"><span>入札結果</span></div>${bidHTML}</div>` : ''}

  ${newsHTML}
  `;
}

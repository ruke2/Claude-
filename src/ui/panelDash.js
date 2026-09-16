// ============================================================
//  経営ダッシュボード
// ============================================================
import { money, pct, pctDelta, num, dcls, arrow, stars } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty } from './dom.js';
import { kpis, ttm, unrealizedGain, buildBS } from '../sim/finance.js';
import { ranking } from '../sim/rivals.js';
import { orgPower, projectCapacity } from '../sim/hr.js';
import { USES, DISTRICTS } from '../data/city.js';

export const title = '経営ダッシュボード';

export function render(g) {
  const k = kpis(g);
  const t = ttm(g);
  const h = g.finance.history;
  const rank = ranking(g, 'rev');
  const me = rank.find(x => x.isPlayer);
  const p = orgPower(g);
  const ug = k.unrealized;

  const revSeries = h.slice(-16).map(x => x.pl.revenue);
  const opSeries = h.slice(-16).map(x => x.pl.op);

  // セグメント構成
  const segTotal = Math.max(1, t.revSale + t.revLease + t.revFee);
  const segs = [
    { n: '分譲事業', v: t.revSale, c: '#4ade9b' },
    { n: '賃貸事業', v: t.revLease, c: '#54d6ff' },
    { n: 'その他・連結', v: t.revFee + (t.revenue - t.revSale - t.revLease - t.revFee), c: '#a78bfa' },
  ];

  const m = g.market;
  const demRows = Object.entries(m.demand).filter(([u]) => USES[u]).map(([u, v]) => `
    <div class="kv"><span class="k">${USES[u].name}</span>
    <span class="v" style="color:${v > 1.08 ? 'var(--green)' : v < 0.92 ? 'var(--red)' : 'var(--ink)'}">${(v * 100).toFixed(0)}</span></div>`).join('');

  const newsHTML = (g.news || []).slice(-8).reverse().map(n => `
    <div class="newsitem"><span class="ico">${n.icon}</span><span>${n.text}</span></div>`).join('') || empty('まだニュースはない');

  return `
  ${section('主要指標', `直近4四半期（${g.year}年Q${g.quarter}時点）`, `
    <div class="grid4">
      ${mini('売上高', money(t.revenue, { unit: false }), t.revenue >= 10000 ? '億円' : '百万円')}
      ${mini('営業利益', money(t.op, { unit: false }), `利益率 ${pct(k.opMargin)}`, t.op >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('当期純利益', money(t.net, { unit: false }), '', t.net >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('ROE', pct(k.roe), `ROA ${pct(k.roa)}`, k.roe >= 0.08 ? 'var(--gold)' : '')}
    </div>
    <div style="margin-top:12px">${spark(revSeries, { color: '#e3b558' })}</div>
    <div class="hint">売上高の推移（直近16四半期）</div>
  `)}

  ${section('財務ポジション', `格付 ${k.rating.id}`, `
    <div class="grid2">
      <div>
        ${kv('現金及び預金', money(g.cash), 'big')}
        ${kv('有利子負債', money(g.debt))}
        ${kv('純資産', money(k.bps * g.company.shares / 1e6))}
        ${kv('自己資本比率', pct(k.equityRatio))}
        ${kv('D/Eレシオ', k.de.toFixed(2) + '倍')}
      </div>
      <div>
        ${kv('借入可能枠', money(k.capacity))}
        ${kv('調達余力', money(k.room))}
        ${kv('適用金利', pct(k.rate, 2))}
        ${kv('保有不動産 含み益', `<span class="${dcls(ug.gain)}">${money(ug.gain, { sign: true })}</span>`)}
        ${kv('企業ブランド', `${stars(g.company.brand)} ${g.company.brand.toFixed(0)}`)}
      </div>
    </div>
    ${g.company.listed ? `<div class="grid3" style="margin-top:10px">
      ${mini('株価', num(k.price) + '円')}
      ${mini('時価総額', money(k.cap, { unit: false }), '億円')}
      ${mini('EPS', num(k.eps, 1) + '円', `BPS ${num(k.bps, 0)}円`)}
    </div>` : `<div class="hint" style="margin-top:8px">当社は未上場である。財務パネルから上場の条件を確認できる。</div>`}
  `)}

  ${section('事業ポートフォリオ', '直近4四半期の売上構成', `
    ${segs.map(s => `
      <div class="kv"><span class="k">${s.n}</span><span class="v">${money(s.v)}　<span style="color:var(--ink-mute)">${pct(s.v / segTotal, 0)}</span></span></div>
      <div class="bar"><i style="width:${(s.v / segTotal * 100).toFixed(1)}%;background:${s.c}"></i></div>
    `).join('')}
    <div class="grid4" style="margin-top:12px">
      ${mini('保有賃貸物件', g.assets.length + '件', money(g.assets.reduce((a, x) => a + (x.bookLand + x.bookBuild), 0)))}
      ${mini('分譲在庫', g.inventory.length + '件', money(g.inventory.reduce((a, x) => a + x.cost * (1 - x.soldRatio), 0)))}
      ${mini('開発中', g.projects.length + `/${projectCapacity(g)}件`, '同時進行の上限')}
      ${mini('未着工の用地', g.cells.filter(c => c.owner === 'player' && !c.building && !c.projectId).length + '件', '')}
    </div>
  `)}

  ${section('市況', `${m.phaseName}局面`, `
    <div class="card" style="border-color:rgba(227,181,88,.25)">
      <div class="card-t"><span class="card-n">${m.phaseName}</span>${chip(`センチメント ${(m.sentiment * 100).toFixed(0)}`, m.sentiment > 0.6 ? 'green' : m.sentiment < 0.4 ? 'red' : 'grey')}</div>
      <div class="card-s">${m.phaseDesc || ''}</div>
    </div>
    <div class="grid3">
      ${mini('不動産価格指数', (m.priceIdx * 100).toFixed(0), '100 = 2026年', m.priceIdx > 1.05 ? 'var(--green)' : m.priceIdx < 0.95 ? 'var(--red)' : '')}
      ${mini('建設費指数', (m.costIdx * 100).toFixed(0), '上昇＝原価増', m.costIdx > 1.15 ? 'var(--red)' : '')}
      ${mini('長期金利', pct(m.rate, 2), '調達コストの基準')}
    </div>
    <div style="margin-top:10px"><div class="sec-t" style="border:none;padding:0;margin-bottom:4px"><span>用途別の需要指数</span></div>${demRows}</div>
  `)}

  ${section('業界ポジション', `売上高ランキング ${me ? me.rank : '—'}位 / ${rank.length}社`, `
    <table class="tbl">
      <tr><th>順位</th><th>企業</th><th>売上高</th><th>営業利益</th><th>純利益</th></tr>
      ${rank.slice(0, 5).map(r => row(r)).join('')}
      ${me && me.rank > 5 ? `<tr><td colspan="5" style="text-align:center;color:var(--ink-mute)">…</td></tr>` + row(me) : ''}
    </table>
    <div class="hint">競合タブで各社の詳細な財務と戦略を確認できる。</div>
  `)}

  ${section('最近の出来事', '', newsHTML)}
  `;
}

function row(r) {
  return `<tr class="${r.isPlayer ? 'me' : ''}">
    <td>${r.rank}</td>
    <td><span style="color:${r.color}">■</span> ${r.name}</td>
    <td>${money(r.rev)}</td>
    <td>${money(r.op)}</td>
    <td>${money(r.np)}</td>
  </tr>`;
}

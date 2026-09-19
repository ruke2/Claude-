// ============================================================
//  経営ダッシュボード
// ============================================================
import { money, moneyHTML, pct, pctDelta, num, dcls, arrow, stars, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty } from './dom.js';
import { kpis, ttm, unrealizedGain, buildBS, overdraft, debtCapacity, effectiveRate } from '../sim/finance.js';
import { personnelCost, payIndex, projectCapacity } from '../sim/hr.js';
import { ranking } from '../sim/rivals.js';
import { orgPower } from '../sim/hr.js';
import { USES, DISTRICTS } from '../data/city.js';
import { TIERS, UNLOCK_INFO, tierOf, nextTier, unlocked, ttmRevenue } from '../sim/company.js';

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
    { n: '分譲事業', v: t.revSale, c: '#0f8a55' },
    { n: '賃貸事業', v: t.revLease, c: '#0d7ea8' },
    { n: 'その他・連結', v: t.revFee + (t.revenue - t.revSale - t.revLease - t.revFee), c: '#6b4bc4' },
  ];

  const m = g.market;
  const demRows = Object.entries(m.demand).filter(([u]) => USES[u]).map(([u, v]) => `
    <div class="kv"><span class="k">${USES[u].name}</span>
    <span class="v" style="color:${v > 1.08 ? 'var(--green)' : v < 0.92 ? 'var(--red)' : 'var(--ink)'}">${(v * 100).toFixed(0)}</span></div>`).join('');

  const newsHTML = (g.news || []).slice(-8).reverse().map(n => `
    <div class="newsitem"><span class="ico">${n.icon}</span><span>${n.text}</span></div>`).join('') || empty('まだニュースはない');

  return `
  ${alerts(g, k, t, p)}
  ${section('主要指標', `直近4四半期（${g.year}年 ${g.month}月 第${g.weekOfMonth}週目時点）`, `
    <div class="grid4">
      ${mini('売上高', moneyHTML(t.revenue), '直近4四半期')}
      ${mini('営業利益', moneyHTML(t.op), `利益率 ${pct(k.opMargin)}`, t.op >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('当期純利益', moneyHTML(t.net), '', t.net >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('ROE', pct(k.roe), `ROA ${pct(k.roa)}`, k.roe >= 0.08 ? 'var(--gold)' : '')}
    </div>
    <div style="margin-top:12px">${spark(revSeries, { color: '#b0781a' })}</div>
    <div class="hint">売上高の推移（直近16四半期）</div>
  `)}

  ${growth(g)}

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
      ${mini('時価総額', money(k.cap, { unit: false }), moneyUnit(k.cap))}
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

/** 経営上の注意喚起 */
function alerts(g, k, t, p) {
  const list = [];
  const od = overdraft(g);
  const burn = Math.round(personnelCost(g) * 13 + 200);

  if (od > 0) list.push({ lv: 'red', t: '借入枠を超過している', d: `超過額 ${money(od)}。この状態が4四半期続くと支払不能となる。物件売却・増資・返済で早急に解消すること。` });
  if (g.cash < burn) list.push({ lv: 'red', t: '手元資金が薄い', d: `現預金 ${money(g.cash)} に対し、四半期の固定的支出は約 ${money(burn)}。調達余力は ${money(k.room)}。` });
  if (k.de > 3.2 && od <= 0) list.push({ lv: 'amber', t: `D/Eレシオが ${k.de.toFixed(1)}倍`, d: '負債への依存が高い。金利上昇や市況悪化の影響を受けやすい。保有物件の売却による圧縮を検討すること。' });
  if (k.equityRatio < 0.18) list.push({ lv: 'amber', t: `自己資本比率 ${pct(k.equityRatio, 0)}`, d: `格付は ${k.rating.id}。金利は ${pct(k.rate, 2)} まで上がっている。` });

  const stale = g.inventory.filter(i => i.weeksOnSale >= 104 && i.soldRatio < 0.8);
  if (stale.length) list.push({ lv: 'amber', t: `長期在庫 ${stale.length}件`, d: `${stale.map(i => i.name).join('・')}。値下げしなければ評価損が続く。` });

  const idle = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);
  if (idle.length >= 3) list.push({ lv: 'amber', t: `未着工の用地 ${idle.length}件`, d: '保有しているだけで固定資産税と金利がかかる。早期に事業化するか、方針を見直すこと。' });

  if (!g.projects.length && !g.inventory.length && g.week > 26) list.push({ lv: 'amber', t: '開発パイプラインが切れている', d: '進行中の案件も販売中の在庫もない。数年後の売上がゼロになる。用地の仕込みを急ぐこと。' });

  const mor = g.staff.length ? g.staff.reduce((a, s) => a + s.morale, 0) / g.staff.length : 1;
  if (mor < 0.55) list.push({ lv: 'amber', t: '社員の士気が低下している', d: `平均モチベーション ${(mor * 100).toFixed(0)}。給与水準は市場比 ${pct(payIndex(g), 0)}。離職と引き抜きが増える。` });

  if (g.takeoverOffer) list.push({ lv: 'red', t: '買収提案を受けている', d: `${g.takeoverOffer.name}から買収提案が来ている。競合タブで回答すること。` });

  if (g.projects.length >= projectCapacity(g)) list.push({ lv: 'cyan', t: '開発案件が上限に達している', d: `建設管理部と商品企画部を増員すれば、同時に扱える案件が増える（現在 ${projectCapacity(g)}件）。` });

  if (!list.length) return '';
  return section('経営上の注意', `${list.length}件`, list.map(a => `
    <div class="card" style="border-color:${a.lv === 'red' ? 'rgba(255,107,122,.45)' : a.lv === 'amber' ? 'rgba(255,180,84,.35)' : 'rgba(84,214,255,.3)'}">
      <div class="card-t"><span class="card-n" style="color:${a.lv === 'red' ? 'var(--red)' : a.lv === 'amber' ? 'var(--amber)' : 'var(--cyan)'}">${a.lv === 'cyan' ? 'ℹ' : '⚠'} ${a.t}</span></div>
      <div class="card-s">${a.d}</div>
    </div>`).join(''));
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

// ------------------------------------------------------------
//  成長段階 — 売上が伸びると何ができるようになるか
// ------------------------------------------------------------
function growth(g) {
  const now = tierOf(g);
  const nx = nextTier(g);
  const rev = ttmRevenue(g);
  const home = DISTRICTS[g.company.home];

  const rows = TIERS.map(t => {
    const done = rev >= t.rev;
    const isNow = t === now;
    const gained = t.unlock.map(k => UNLOCK_INFO[k]).filter(Boolean);
    return `<div class="tierrow ${isNow ? 'now' : done ? 'done' : ''}">
      <span class="tr-m">${isNow ? '▶' : done ? '✓' : '·'}</span>
      <span class="tr-b">
        <span class="tr-n">${t.name}</span>
        <span class="tr-d">売上高 ${t.rev ? Math.round(t.rev / 100).toLocaleString() + '億円〜' : '創業時'}　${
      gained.length ? gained.map(x => `${x.icon} ${x.name}`).join('／') : '用地取得・開発・分譲'}</span>
      </span>
    </div>`;
  }).join('');

  const waiting = [];
  for (const t of TIERS) for (const key of t.unlock) {
    if (unlocked(g, key)) continue;
    const info = UNLOCK_INFO[key];
    if (info) waiting.push({ key, info, need: t.rev });
  }

  return section('成長段階', now.name, `
    <div class="card" style="border-color:rgba(227,181,88,.3);background:var(--gold-soft)">
      <div class="card-t"><span class="card-n">${now.name}</span>${
    chip(`地盤 ${home ? home.short : '—'}`, 'gold')}</div>
      <div class="card-s">${now.desc}${home ? `<br>${home.name}では分譲単価と募集賃料に上乗せがつき、稼働率も入札の評価も有利になる。` : ''}</div>
      ${nx ? `<div class="kv" style="margin-top:8px"><span class="k">次は「${nx.name}」まで</span>
        <span class="v">${money(Math.max(0, nx.rev - rev))} 足りない</span></div>
        ${bar(Math.min(1, nx.rev > 0 ? rev / nx.rev : 1), 'gold')}` : '<div class="hint">最上位の段階に到達している。</div>'}
    </div>
    <div style="margin-top:10px">${rows}</div>
    ${waiting.length ? `<div class="hint">解禁待ち：${waiting.map(w => `${w.info.icon} ${w.info.name}（${Math.round(w.need / 100).toLocaleString()}億円）`).join('、 ')}</div>` : '<div class="hint">すべての機能が解禁されている。</div>'}
  `);
}

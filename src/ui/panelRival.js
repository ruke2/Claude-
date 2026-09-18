// ============================================================
//  競合パネル — 業界ランキングと各社の分析
// ============================================================
import { money, num, pct, stars, moneyUnit, moneyHTML } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty, openModal } from './dom.js';
import { ranking } from '../sim/rivals.js';
import { ttm, buildBS, kpis, sharePrice, marketCap } from '../sim/finance.js';
import { cultureLabel, AXES } from '../sim/culture.js';
import { USES, DISTRICTS, TERRAIN } from '../data/city.js';

export const title = '競合分析';

const KEYS = [
  { k: 'rev', n: '売上高' }, { k: 'op', n: '営業利益' }, { k: 'np', n: '純利益' },
  { k: 'assets', n: '総資産' }, { k: 'equity', n: '純資産' }, { k: 'brand', n: 'ブランド' },
];

export function render(g, ctx) {
  const key = ctx.rivalKey || 'rev';
  const list = ranking(g, key);
  const me = list.find(x => x.isPlayer);

  const table = `<table class="tbl">
    <tr><th>順位</th><th>企業</th><th>売上高</th><th>営業利益</th><th>営利率</th><th>純資産</th><th>従業員</th></tr>
    ${list.map(r => `<tr class="click ${r.isPlayer ? 'me' : ''}" data-act="rival.detail" data-id="${r.id}">
      <td>${r.rank}</td>
      <td><span style="color:${r.color}">■</span> ${r.name}</td>
      <td>${money(r.rev)}</td>
      <td>${money(r.op)}</td>
      <td>${pct(r.op / Math.max(1, r.rev), 1)}</td>
      <td>${money(r.equity)}</td>
      <td>${num(r.employees)}</td>
    </tr>`).join('')}
  </table>`;

  const lotsByRival = {};
  for (const c of g.cells) if (c.owner && c.owner !== 'other' && c.owner !== 'player') lotsByRival[c.owner] = (lotsByRival[c.owner] || 0) + 1;
  const myLots = g.cells.filter(c => c.owner === 'player').length;
  // シェアの母数は市内の宅地の総数
  const totalLots = Math.max(1, g.cells.filter(c => c.terrain === TERRAIN.LOT).length);

  return `
  ${section('業界ランキング', `${KEYS.find(x => x.k === key).n}順`, `
    <div class="btnrow" style="margin-bottom:9px">
      ${KEYS.map(x => `<button class="btn sm ${x.k === key ? 'primary' : ''}" data-act="rival.sort" data-id="${x.k}">${x.n}</button>`).join('')}
    </div>
    ${table}
    <div class="hint">当社は${KEYS.find(x => x.k === key).n}で ${me ? me.rank : '—'}位 / ${list.length}社。行をクリックすると各社の詳細を確認できる。</div>
  `)}

  ${section('湊都市の土地所有', '保有区画数', `
    <table class="tbl">
      <tr><th>企業</th><th>保有区画</th><th>シェア</th></tr>
      <tr class="me"><td><span style="color:#e3b558">■</span> ${g.company.name}</td><td>${myLots}</td><td>${pct(myLots / totalLots, 1)}</td></tr>
      ${g.rivals.slice().sort((a, b) => (lotsByRival[b.id] || 0) - (lotsByRival[a.id] || 0)).map(r => `
        <tr><td><span style="color:${r.color}">■</span> ${r.name}</td><td>${lotsByRival[r.id] || 0}</td><td>${pct((lotsByRival[r.id] || 0) / totalLots, 1)}</td></tr>`).join('')}
    </table>
    <div class="hint">市内の宅地は全${num(totalLots)}区画。都市ビューの表示レイヤーを切り替えると、所有者ごとの色分けを確認できる。</div>
  `)}

  ${g.takeoverOffer ? section('買収提案', '', `
    <div class="card" style="border-color:rgba(255,107,122,.5)">
      <div class="card-t"><span class="card-n">🦈 ${g.takeoverOffer.name}からの買収提案</span></div>
      <div class="card-s">当社の全株式を${money(g.takeoverOffer.price)}（プレミアム${((g.takeoverOffer.premium - 1) * 100).toFixed(0)}%）で取得したいとの申し入れである。受諾すれば経営から退くことになる。</div>
      <div class="btnrow">
        <button class="btn danger" data-act="rival.accept">受諾する（ゲーム終了）</button>
        <button class="btn" data-act="rival.reject">拒否する</button>
      </div>
    </div>`) : ''}
  `;
}

export function openDetail(g, id, ctx) {
  if (id === 'player') return openSelf(g, ctx);
  const r = g.rivals.find(x => x.id === id);
  if (!r) return;
  const hist = r.history.slice(-16);
  const focus = Object.entries(r.focus).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const lots = g.cells.filter(c => c.owner === r.id).length;

  openModal(`${r.name}`, `
    <div class="card" style="border-color:${r.color}55">
      <div class="card-t"><span class="card-n" style="color:${r.color}">${r.name}</span>${chip(r.listed ? '上場' : '非上場', 'grey')}</div>
      <div class="card-s"><b>${r.tagline}</b><br><br>${r.profile}</div>
    </div>
    <div class="grid4" style="margin:12px 0">
      ${mini('売上高', money(r.rev, { unit: false }), moneyUnit(r.rev))}
      ${mini('営業利益', moneyHTML(r.op), pct(r.op / r.rev, 1))}
      ${mini('純利益', money(r.np, { unit: false }), moneyUnit(r.np))}
      ${mini('従業員', num(r.employees), '名')}
    </div>
    ${hist.length > 2 ? `<div>${spark(hist.map(x => x.rev), { color: r.color })}</div><div class="hint">売上高の推移</div>` : ''}
    <div class="sec">
      <div class="sec-t"><span>財務</span></div>
      ${kv('総資産', money(r.assets))}
      ${kv('純資産', money(r.equity))}
      ${kv('有利子負債', money(r.debt))}
      ${kv('自己資本比率', pct(r.equity / r.assets))}
      ${r.listed ? kv('時価総額', money(Math.round(r.stock * 100))) : ''}
    </div>
    <div class="sec">
      <div class="sec-t"><span>戦略プロファイル</span></div>
      ${kv('ブランド力', `${stars(r.brand)} ${r.brand.toFixed(0)}`)}
      ${kv('入札の積極性', `${(r.aggression * 100).toFixed(0)} / 100`)}
      ${bar(r.aggression, 'red')}
      ${kv('湊都市の保有区画', lots + '区画')}
      <div style="margin-top:8px"><div class="sec-t" style="border:none;padding:0"><span>注力アセット</span></div>
      ${focus.map(([u, v]) => `<div class="kv"><span class="k">${USES[u] ? USES[u].name : u}</span><span class="v">${(v * 100).toFixed(0)}</span></div>${bar(v)}`).join('')}</div>
    </div>
    <div class="hint">この会社は最低取引規模 ${money(Math.round(r.rev * 0.0062))} 以上の案件にしか手を出さない。小型案件はこうした大手と競合せずに取得できる。</div>
  `, [{ label: '閉じる', cls: 'ghost' }]);
}

// ------------------------------------------------------------
//  自社の会社概要（他社と同じ見方で自分を眺める）
// ------------------------------------------------------------
function openSelf(g, ctx) {
  const t = ttm(g);
  const bs = buildBS(g);
  const k = kpis(g);
  const color = '#e3b558';
  const hist = (g.finance.history || []).slice(-16);
  const lots = g.cells.filter(c => c.owner === 'player').length;
  const list = ranking(g, 'rev');
  const me = list.find(x => x.isPlayer);

  // 自社がどの用途に寄っているか（保有＋分譲在庫＋進行中）を集計する
  const focus = {};
  const add = (use, v) => { if (use) focus[use] = (focus[use] || 0) + v; };
  for (const a of g.assets) add(a.use, a.nra || 0);
  for (const i of g.inventory) add(i.use, i.area || 0);
  for (const pj of g.projects) add(pj.use, pj.gfa || 0);
  const focusMax = Math.max(1, ...Object.values(focus));
  const focusList = Object.entries(focus).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const culture = AXES.map(a => {
    const v = (g.culture || {})[a.id] ?? 0.5;
    return `<div class="kv"><span class="k">${a.name}</span><span class="v">${
      v >= 0.66 ? a.high : v <= 0.34 ? a.low : 'どちらでもない'}</span></div>${bar(v, 'violet')}`;
  }).join('');

  openModal(`${g.company.name}（当社）`, `
    <div class="card" style="border-color:${color}88;background:var(--gold-soft)">
      <div class="card-t"><span class="card-n" style="color:var(--gold-2)">${g.company.name}</span>${
    chip(g.company.listed ? '上場' : '非上場', 'grey')}</div>
      <div class="card-s"><b>${g.year}年 ${g.month}月 第${g.weekOfMonth}週目時点／${g.company.founded}年創業</b><br><br>
        湊都市を地盤とする不動産デベロッパー。売上高で業界 ${me ? me.rank : '—'}位 / ${list.length}社。
        社風は「${cultureLabel(g)}」。</div>
    </div>
    <div class="grid4" style="margin:12px 0">
      ${mini('売上高', money(t.revenue, { unit: false }), moneyUnit(t.revenue))}
      ${mini('営業利益', moneyHTML(t.op), t.revenue > 0 ? pct(t.op / t.revenue, 1) : '')}
      ${mini('純利益', money(t.net, { unit: false }), moneyUnit(t.net))}
      ${mini('従業員', num(g.staff.length), '名')}
    </div>
    ${hist.length > 2 ? `<div>${spark(hist.map(x => x.pl.revenue), { color })}</div><div class="hint">売上高の推移（直近${hist.length}四半期）</div>` : ''}
    <div class="sec">
      <div class="sec-t"><span>財務</span><span class="note">格付 ${g.company.creditRating}</span></div>
      ${kv('総資産', money(bs.total))}
      ${kv('純資産', money(bs.equity))}
      ${kv('有利子負債', money(g.debt))}
      ${kv('自己資本比率', pct(bs.equity / Math.max(1, bs.total)))}
      ${kv('ROE', pct(k.roe))}
      ${g.company.listed ? kv('時価総額', money(Math.round(marketCap(g)))) : ''}
      ${g.company.listed ? kv('株価', num(Math.round(sharePrice(g))) + '円') : ''}
    </div>
    <div class="sec">
      <div class="sec-t"><span>事業プロファイル</span></div>
      ${kv('ブランド力', `${stars(g.company.brand)} ${g.company.brand.toFixed(0)}`)}
      ${kv('湊都市の保有区画', lots + '区画')}
      ${kv('累計の竣工棟数', num(g.kpi.builtCount) + '棟')}
      ${kv('累計の引渡戸数', num(g.kpi.soldUnits) + '戸')}
      ${focusList.length ? `<div style="margin-top:8px"><div class="sec-t" style="border:none;padding:0"><span>注力アセット</span></div>
        ${focusList.map(([u, v]) => `<div class="kv"><span class="k">${USES[u] ? USES[u].name : u}</span><span class="v">${(v / focusMax * 100).toFixed(0)}</span></div>${bar(v / focusMax)}`).join('')}
      </div>` : '<div class="hint">まだ保有・開発中の物件がないため、注力アセットは定まっていない。</div>'}
    </div>
    <div class="sec">
      <div class="sec-t"><span>企業カルチャー</span><span class="note">人事タブで変更できる</span></div>
      ${culture}
    </div>
  `, [{ label: '閉じる', cls: 'ghost' }]);
}

// ============================================================
//  保有物件パネル — 賃貸ポートフォリオ
// ============================================================
import { money, num, pct } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { assetValue, currentNOI, subEffect } from '../sim/valuation.js';
import { orgPower } from '../sim/hr.js';

export const title = '保有物件';

export function render(g, ctx) {
  const p = orgPower(g);
  let book = 0, mv = 0, noi = 0;
  for (const a of g.assets) { book += a.bookLand + a.bookBuild; mv += assetValue(g, a); noi += currentNOI(g, a); }

  const byUse = {};
  for (const a of g.assets) {
    const k = a.use;
    byUse[k] = byUse[k] || { n: 0, nra: 0, noi: 0, mv: 0 };
    byUse[k].n++; byUse[k].nra += a.nra; byUse[k].noi += currentNOI(g, a); byUse[k].mv += assetValue(g, a);
  }

  const cards = g.assets.length ? g.assets.map(a => {
    const d = DISTRICTS[a.district];
    const v = assetValue(g, a), b = a.bookLand + a.bookBuild;
    const n = currentNOI(g, a);
    const gap = a.rent / Math.max(1, a.marketRent) - 1;
    return `<div class="card">
      <div class="card-t"><span class="card-n">${a.name}</span>${chip(USES[a.use].name, 'cyan')}</div>
      <div class="card-s">${d.name}／貸室${num(a.nra)}坪／築${a.age.toFixed(1)}年／${GRADES[a.grade].name}</div>
      <div class="kv"><span class="k">稼働率</span><span class="v ${a.occupancy < 0.75 ? 'down' : a.occupancy > 0.93 ? 'up' : ''}">${pct(a.occupancy, 0)}</span></div>
      ${bar(a.occupancy, a.occupancy < 0.75 ? 'red' : '')}
      <div class="kv"><span class="k">賃料</span><span class="v">${num(a.rent)}円/坪·月　<span style="color:${Math.abs(gap) < 0.03 ? 'var(--ink-mute)' : gap > 0 ? 'var(--amber)' : 'var(--green)'}">市場比${(gap * 100).toFixed(0)}%</span></span></div>
      <div class="kv"><span class="k">年間NOI</span><span class="v">${money(n)}</span></div>
      <div class="kv"><span class="k">簿価 / 時価</span><span class="v">${money(b)} / ${money(v)}</span></div>
      <div class="kv"><span class="k">含み損益</span><span class="v ${v - b >= 0 ? 'up' : 'down'}">${money(v - b, { sign: true })}</span></div>
      <div class="kv"><span class="k">利回り（NOI÷簿価）</span><span class="v">${pct(n / Math.max(1, b))}</span></div>
      <div class="btnrow">
        <button class="btn sm" data-act="focus" data-id="${a.cellId}">📍</button>
        <button class="btn sm" data-act="asset.rent" data-id="${a.id}">賃料を改定する</button>
        <button class="btn sm danger" data-act="asset.sell" data-id="${a.id}">売却する</button>
      </div>
    </div>`;
  }).join('') : empty('保有している賃貸物件はない');

  return `
  ${section('賃貸ポートフォリオ', `${g.assets.length}件`, `
    <div class="grid4">
      ${mini('簿価合計', money(book, { unit: false }), '億円')}
      ${mini('時価合計', money(mv, { unit: false }), '億円')}
      ${mini('含み損益', money(mv - book, { unit: false }), '億円', mv - book >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('年間NOI', money(noi, { unit: false }), `利回り ${pct(noi / Math.max(1, book))}`)}
    </div>
    ${Object.keys(byUse).length ? `<table class="tbl" style="margin-top:12px">
      <tr><th>用途</th><th>件数</th><th>貸室面積</th><th>年間NOI</th><th>時価</th></tr>
      ${Object.entries(byUse).map(([u, v]) => `<tr><td>${USES[u].name}</td><td>${v.n}</td><td>${num(v.nra)}坪</td><td>${money(v.noi)}</td><td>${money(v.mv)}</td></tr>`).join('')}
    </table>` : ''}
    <div class="hint">ビル事業部の能力（${p.lease.quality.toFixed(0)}）が稼働率と賃料改定の交渉力を左右する。${subEffect(g, 'exitPremium') > 0 ? `REIT運用会社があるため、売却時に${pct(subEffect(g, 'exitPremium'), 0)}のプレミアムが乗る。` : ''}</div>
  `)}
  ${section('物件一覧', '', cards)}
  `;
}

export function openRent(g, a, ctx) {
  openModal(`賃料改定 — ${a.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();
  function build() {
    return `
    <div class="card">
      ${kv('現行賃料', num(a.rent) + '円/坪·月')}
      ${kv('市場賃料', num(a.marketRent) + '円/坪·月')}
      ${kv('稼働率', pct(a.occupancy, 0))}
      ${kv('貸室面積', num(a.nra) + '坪')}
    </div>
    <div class="field" style="margin-top:12px">
      <label>新しい募集賃料（円/坪·月）</label>
      <input type="number" id="inpR" value="${a.rent}" step="500">
      <input type="range" id="rngR" min="${Math.round(a.marketRent * 0.6)}" max="${Math.round(a.marketRent * 1.4)}" value="${a.rent}" step="100" style="width:100%;margin-top:8px;accent-color:var(--gold)">
    </div>
    <div id="rInfo" class="hint"></div>
    <div class="hint">市場賃料を上回る設定は空室を増やす。逆に安すぎると収益を取りこぼす。既存テナントの賃料は段階的にしか動かない。</div>
    <div class="btnrow"><button class="btn primary" data-set="1">改定する</button></div>`;
  }
  function bind() {
    const body = document.getElementById('modalBody');
    const inp = body.querySelector('#inpR'), rg = body.querySelector('#rngR'), info = body.querySelector('#rInfo');
    const sync = v => {
      inp.value = v; rg.value = v;
      const gap = v / a.marketRent;
      const target = Math.max(0, Math.min(1, (1.34 - gap * 0.36) * 0.95));
      info.innerHTML = `市場比 <b>${((gap - 1) * 100).toFixed(0)}%</b>　想定稼働率 <b>${(target * 100).toFixed(0)}%</b>　満室想定賃料収入 ${money(Math.round(a.nra * v * 12 / 1e6))}／年`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-set]').onclick = () => {
      a.rent = Math.round(+inp.value); a.lastRentReview = g.turn;
      toast('募集賃料を改定した');
      ctx.refresh(); closeModal();
    };
  }
}

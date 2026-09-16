// ============================================================
//  販売パネル — 分譲在庫の管理
// ============================================================
import { money, num, pct } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { repriceInventory } from '../sim/sales.js';
import { contractSpeed } from '../sim/project.js';
import { orgPower } from '../sim/hr.js';
import { weeksLabel } from '../core/time.js';

export const title = '分譲販売';

export function render(g, ctx) {
  const p = orgPower(g);
  const presales = g.projects.filter(x => x.saleArea > 0);

  const cards = g.inventory.length ? g.inventory.map(inv => {
    const d = DISTRICTS[inv.district];
    const remain = 1 - inv.soldRatio;
    const speed = contractSpeed(g, inv.use, inv.price, inv.basePrice, p, inv.district);
    const qLeft = speed > 0 ? Math.ceil(remain / speed) : 999;
    const gap = inv.price / inv.basePrice - 1;
    return `<div class="card">
      <div class="card-t"><span class="card-n">${inv.name}</span>${chip(USES[inv.use].name, 'green')}</div>
      <div class="card-s">${d.name}／全${num(inv.units)}戸／${GRADES[inv.grade].name}／販売開始から${weeksLabel(inv.weeksOnSale)}</div>
      ${bar(inv.soldRatio)}
      <div class="kv"><span class="k">契約率</span><span class="v">${pct(inv.soldRatio, 0)}（残 ${num(Math.round(inv.units * remain))}戸）</span></div>
      <div class="kv"><span class="k">販売単価</span><span class="v">坪${(inv.price * 100).toFixed(0)}万円 <span style="color:${Math.abs(gap) < 0.02 ? 'var(--ink-mute)' : gap > 0 ? 'var(--red)' : 'var(--green)'}">（市場比 ${(gap * 100).toFixed(1)}%）</span></span></div>
      <div class="kv"><span class="k">累計売上</span><span class="v">${money(inv.revenue)}</span></div>
      <div class="kv"><span class="k">残戸の在庫簿価</span><span class="v">${money(Math.round(inv.cost * remain))}</span></div>
      <div class="kv"><span class="k">完売見込み</span><span class="v ${qLeft > 104 ? 'down' : ''}">${qLeft > 400 ? '不明' : `あと${weeksLabel(qLeft)}`}</span></div>
      ${inv.impaired ? `<div class="kv"><span class="k">評価損累計</span><span class="v down">${money(inv.impaired)}</span></div>` : ''}
      ${inv.weeksOnSale >= 104 && inv.soldRatio < 0.8 ? `<div class="hint" style="color:var(--amber)">販売が長期化している。値下げを検討しなければ評価損が発生する。</div>` : ''}
      <div class="btnrow"><button class="btn sm" data-act="focus" data-id="${inv.cellId}">📍</button><button class="btn sm" data-act="sales.price" data-id="${inv.id}">価格を改定する</button></div>
    </div>`;
  }).join('') : empty('分譲在庫はない');

  const pre = presales.length ? presales.map(pj => `
    <div class="card">
      <div class="card-t"><span class="card-n">${pj.name}</span>${chip(`竣工まで${weeksLabel(Math.max(0, pj.weeks + pj.delay - pj.elapsed))}`, 'cyan')}</div>
      <div class="card-s">${DISTRICTS[pj.district].name}／${num(pj.plan.units || 0)}戸予定／坪${(pj.salePrice * 100).toFixed(0)}万円</div>
      ${bar(pj.preContract)}
      <div class="kv"><span class="k">事前契約率</span><span class="v">${pct(pj.preContract, 0)}</span></div>
      <div class="hint">${pj.progress > 0.25 ? 'モデルルームを公開し、青田売りを進めている。' : '工事の進捗が25%を超えると販売活動を開始できる。'}</div>
    </div>`).join('') : empty('建設中の分譲案件はない');

  return `
  ${section('販売体制', '', `
    <div class="grid3">
      ${mini('販売事業部', p.sales.quality.toFixed(0), `${p.sales.count}名`)}
      ${mini('企業ブランド', g.company.brand.toFixed(0), 'ブランドが高いほど売れる')}
      ${mini('住宅需要指数', (g.market.demand.resi * 100).toFixed(0), g.market.demand.resi > 1.05 ? '好調' : g.market.demand.resi < 0.95 ? '低調' : '横ばい')}
    </div>
    <div class="hint">契約の進みは「市場価格との乖離 × 需要 × 販売力 × ブランド」で決まる。販売子会社を設立すると15%速くなる。</div>
  `)}
  ${section('竣工済みの在庫', `${g.inventory.length}件`, cards)}
  ${section('建設中の分譲案件（青田売り）', `${presales.length}件`, pre)}
  `;
}

export function openReprice(g, inv, ctx) {
  openModal(`価格改定 — ${inv.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();
  function build() {
    return `
    <div class="card">
      ${kv('市場想定坪単価', (inv.basePrice * 100).toFixed(0) + '万円')}
      ${kv('現在の販売単価', (inv.price * 100).toFixed(0) + '万円')}
      ${kv('契約率', pct(inv.soldRatio, 0))}
      ${kv('残戸数', num(Math.round(inv.units * (1 - inv.soldRatio))) + '戸')}
    </div>
    <div class="field" style="margin-top:12px">
      <label>新しい坪単価（万円）</label>
      <input type="number" id="inpP" value="${(inv.price * 100).toFixed(0)}" step="5">
      <input type="range" id="rngP" min="${(inv.basePrice * 55).toFixed(0)}" max="${(inv.basePrice * 140).toFixed(0)}" value="${(inv.price * 100).toFixed(0)}" style="width:100%;margin-top:8px;accent-color:var(--gold)">
    </div>
    <div id="pInfo" class="hint"></div>
    <div class="hint">6%を超える値下げは企業ブランドを毀損する。ただし在庫を抱え続ければ評価損と金利負担が積み上がる。</div>
    <div class="btnrow"><button class="btn primary" data-set="1">改定する</button></div>`;
  }
  function bind() {
    const body = document.getElementById('modalBody');
    const inp = body.querySelector('#inpP'), rg = body.querySelector('#rngP'), info = body.querySelector('#pInfo');
    const sync = v => {
      inp.value = v; rg.value = v;
      const price = v / 100, ratio = price / inv.basePrice;
      const remain = 1 - inv.soldRatio;
      const speed = Math.max(0.12, Math.min(1.85, 2.15 - ratio * 1.15));
      info.innerHTML = `残戸の販売総額 ${money(Math.round(inv.area * remain * price))}　市場比 <b>${((ratio - 1) * 100).toFixed(1)}%</b>　契約の進み ${speed > 1.2 ? '<b class="up">速い</b>' : speed > 0.85 ? '標準的' : '<b class="down">遅い</b>'}`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-set]').onclick = () => {
      repriceInventory(g, inv, (+inp.value) / 100, g.news);
      toast('販売価格を改定した');
      ctx.refresh(); closeModal();
    };
  }
}

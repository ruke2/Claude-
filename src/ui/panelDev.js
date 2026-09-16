// ============================================================
//  開発パネル — 企画・着工・工事進捗
// ============================================================
import { money, num, pct } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { feasibility, canStart } from '../sim/project.js';
import { landAppraisal } from '../sim/valuation.js';
import { orgPower, projectCapacity } from '../sim/hr.js';
import { debtCapacity } from '../sim/finance.js';

export const title = '開発事業';

export function render(g, ctx) {
  const p = orgPower(g);
  const cap = projectCapacity(g);
  const idle = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);

  const running = g.projects.length ? g.projects.map(pj => {
    const c = g.cells.find(x => x.id === pj.cellId);
    const total = pj.quarters + pj.delay;
    const remain = Math.max(0, total - pj.elapsed);
    const over = pj.overrun;
    return `<div class="card">
      <div class="card-t">
        <span class="card-n">${pj.name}</span>
        ${chip(USES[pj.use].name, 'cyan')}
      </div>
      <div class="card-s">${DISTRICTS[pj.district].name}／地上${pj.floors}階・延床${num(pj.gfa)}坪／${GRADES[pj.grade].name}</div>
      ${bar(pj.progress, 'gold')}
      <div class="kv"><span class="k">進捗</span><span class="v">${(pj.progress * 100).toFixed(0)}%（残り${remain}期）</span></div>
      <div class="kv"><span class="k">工事予算 / 支出</span><span class="v">${money(pj.budget)} / ${money(pj.spent)}</span></div>
      ${over ? `<div class="kv"><span class="k">増減額</span><span class="v ${over > 0 ? 'down' : 'up'}">${money(over, { sign: true })}</span></div>` : ''}
      ${pj.delay ? `<div class="kv"><span class="k">工期</span><span class="v ${pj.delay > 0 ? 'down' : 'up'}">${pj.delay > 0 ? `${pj.delay}期 遅延` : `${-pj.delay}期 前倒し`}</span></div>` : ''}
      ${pj.saleArea ? `<div class="kv"><span class="k">事前契約率（青田売り）</span><span class="v">${(pj.preContract * 100).toFixed(0)}%</span></div>${bar(pj.preContract)}` : ''}
      ${pj.events.length ? `<div class="hint">${pj.events.slice(-2).map(e => `${e.icon} ${e.text}`).join('<br>')}</div>` : ''}
      ${pj.saleArea ? `<div class="btnrow"><button class="btn sm" data-act="dev.price" data-id="${pj.id}">販売価格を調整（現在 坪${(pj.salePrice * 100).toFixed(0)}万円）</button></div>` : ''}
    </div>`;
  }).join('') : empty('進行中の開発案件はない');

  const idleCards = idle.length ? idle.map(c => {
    const d = DISTRICTS[c.d];
    const best = bestPlan(g, c);
    return `<div class="card click" data-act="dev.plan" data-id="${c.id}">
      <div class="card-t"><span class="card-n">${d.name}　${num(c.area)}坪</span>${chip('企画待ち', 'amber')}</div>
      <div class="card-s">容積率 ${c.far}%／推奨 ${USES[best.use].name}・${GRADES[best.grade].name}<br>
        想定事業利益 <b class="${best.profit >= 0 ? 'up' : 'down'}">${money(best.profit, { sign: true })}</b>（利益率 ${pct(best.margin)}）</div>
      <div class="btnrow"><button class="btn sm primary" data-act="dev.plan" data-id="${c.id}">事業計画を作る</button></div>
    </div>`;
  }).join('') : empty('企画待ちの用地はない。用地タブから土地を仕入れること。');

  return `
  ${section('開発体制', `同時進行 ${g.projects.length} / ${cap} 件`, `
    <div class="grid3">
      ${mini('建設管理部', p.cons.quality.toFixed(0), `${p.cons.count}名`)}
      ${mini('商品企画部', p.plan.quality.toFixed(0), `${p.plan.count}名`)}
      ${mini('建設費指数', (g.market.costIdx * 100).toFixed(0), g.market.costIdx > 1.1 ? '高止まり' : '安定')}
    </div>
    <div class="hint">建設管理部の能力が高いほど工期が短く、原価の超過も抑えられる。同時進行できる件数は建設管理部と商品企画部の陣容で決まる。</div>
  `)}
  ${section('進行中の案件', `${g.projects.length}件`, running)}
  ${section('企画待ちの用地', `${idle.length}件`, idleCards)}
  `;
}

export function bestPlan(g, c) {
  let best = null;
  for (const u of Object.keys(USES)) {
    for (const gr of Object.keys(GRADES)) {
      const p = feasibility(g, c, u, gr);
      if (!best || p.profit > best.profit) best = { use: u, grade: gr, ...p };
    }
  }
  return best;
}

// ------------------------------------------------------------
//  企画モーダル
// ------------------------------------------------------------
export function openPlan(g, cell, ctx) {
  const d = DISTRICTS[cell.d];
  const rec = bestPlan(g, cell);
  let use = rec.use, grade = rec.grade;

  openModal(`事業計画 — ${d.name} ${num(cell.area)}坪`, build(), []);
  bind();

  function build() {
    const plan = feasibility(g, cell, use, grade);
    const err = canStart(g, cell);
    const equity = Math.max(0, plan.buildCost - Math.max(0, g.cash - 500));
    const risks = (cell.risks || []).filter(r => r.bad);
    const goods = (cell.risks || []).filter(r => !r.bad);

    return `
    <div class="grid3" style="margin-bottom:12px">
      ${mini('土地簿価', money(cell.bookValue ?? cell.lastPaid ?? 0, { unit: false }), '億円')}
      ${mini('建設費', money(plan.buildCost, { unit: false }), '億円')}
      ${mini('総事業費', money(plan.totalCost, { unit: false }), '億円')}
    </div>

    <div class="sec">
      <div class="sec-t"><span>商品の設計</span></div>
      <div class="field"><label>用途</label>
        <select id="selUse">${Object.values(USES).map(u => `<option value="${u.id}" ${u.id === use ? 'selected' : ''}>${u.icon} ${u.name}（適合 ${(d.fit[u.id] ?? .3).toFixed(2)}）</option>`).join('')}</select>
      </div>
      <div class="hint">${USES[use].desc}</div>
      <div class="field" style="margin-top:10px"><label>グレード</label>
        <select id="selGrade">${Object.values(GRADES).map(x => `<option value="${x.id}" ${x.id === grade ? 'selected' : ''}>${x.name}（建設費 ×${x.costMul.toFixed(2)} ／ 単価 ×${x.priceMul.toFixed(2)}）</option>`).join('')}</select>
      </div>
      <div class="hint">${GRADES[grade].desc}　ブランド寄与 +${GRADES[grade].brandGain}</div>
    </div>

    ${risks.length || goods.length ? `<div class="sec">
      <div class="sec-t"><span>この土地の条件</span></div>
      ${risks.map(r => `<div class="kv"><span class="k" style="color:var(--red)">⚠ ${r.name}</span><span class="v">${r.desc}</span></div>`).join('')}
      ${goods.map(r => `<div class="kv"><span class="k" style="color:var(--green)">✨ ${r.name}</span><span class="v">${r.desc}</span></div>`).join('')}
      ${plan.riskExtra ? `<div class="hint">追加費用 ${money(plan.riskExtra)} を事業費に織り込んでいる。</div>` : ''}
    </div>` : ''}

    <div class="sec">
      <div class="sec-t"><span>事業収支</span></div>
      <div class="grid2">
        <div>
          ${kv('延床面積', num(plan.gfa) + '坪')}
          ${kv('階数', '地上' + plan.floors + '階')}
          ${kv('建物高さ', plan.heightM + 'm')}
          ${kv('容積消化率', pct(plan.farUse, 0))}
          ${kv('工期', plan.quarters + '四半期')}
        </div>
        <div>
          ${plan.saleArea ? kv('分譲面積', num(plan.saleArea) + '坪') : ''}
          ${plan.units ? kv('計画戸数', num(plan.units) + '戸') : ''}
          ${plan.salePrice ? kv('想定坪単価', (plan.salePrice * 100).toFixed(0) + '万円') : ''}
          ${plan.saleRevenue ? kv('分譲売上', money(plan.saleRevenue)) : ''}
          ${plan.nra ? kv('貸室面積', num(plan.nra) + '坪') : ''}
          ${plan.rent ? kv('想定賃料', num(plan.rent) + '円/坪·月') : ''}
          ${plan.noi ? kv('年間NOI', money(plan.noi)) : ''}
          ${plan.assetValue ? kv('完成時資産価値', money(plan.assetValue)) : ''}
        </div>
      </div>
      <div class="card" style="margin-top:10px;border-color:${plan.profit >= 0 ? 'rgba(74,222,155,.3)' : 'rgba(255,107,122,.3)'}">
        ${kv('想定事業利益', `<b class="${plan.profit >= 0 ? 'up' : 'down'}">${money(plan.profit, { sign: true })}</b>`, 'big')}
        ${kv('利益率', pct(plan.margin))}
        ${plan.yieldOnCost ? kv('開発利回り（NOI÷総事業費）', pct(plan.yieldOnCost)) : ''}
      </div>
      <div class="card">
        ${kv('着工に要する資金', money(plan.buildCost))}
        ${kv('現預金', money(g.cash))}
        ${kv('借入余力', money(Math.max(0, debtCapacity(g) - g.debt)))}
        <div class="hint">工事代金は出来高に応じて${plan.quarters}回に分けて支払う。四半期あたり約${money(Math.round(plan.buildCost / plan.quarters))}。</div>
      </div>
    </div>

    ${err ? `<div class="card" style="border-color:rgba(255,107,122,.4)"><div class="card-s" style="color:var(--red)">${err}</div></div>` : ''}
    <div class="btnrow">
      <button class="btn primary wide" data-start="1" ${err ? 'disabled' : ''}>この計画で着工する</button>
    </div>`;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }

  function bind() {
    const body = document.getElementById('modalBody');
    const su = body.querySelector('#selUse'), sg = body.querySelector('#selGrade');
    if (su) su.onchange = e => { use = e.target.value; refresh(); };
    if (sg) sg.onchange = e => { grade = e.target.value; refresh(); };
    const st = body.querySelector('[data-start]');
    if (st) st.onclick = () => { ctx.startProject(cell, use, grade); closeModal(); };
  }
}

/** 分譲価格の調整（建設中の青田売り） */
export function openPricing(g, pj, ctx) {
  openModal(`販売価格の設定 — ${pj.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();
  function build() {
    const base = pj.plan.salePrice;
    return `
    <div class="card">
      ${kv('市場想定坪単価', (base * 100).toFixed(0) + '万円')}
      ${kv('現在の設定単価', (pj.salePrice * 100).toFixed(0) + '万円')}
      ${kv('総販売可能額', money(Math.round(pj.saleArea * pj.salePrice)))}
      ${kv('事前契約率', pct(pj.preContract, 0))}
    </div>
    <div class="field" style="margin-top:12px">
      <label>坪単価（万円）</label>
      <input type="number" id="inpP" value="${(pj.salePrice * 100).toFixed(0)}" step="5">
      <input type="range" id="rngP" min="${(base * 60).toFixed(0)}" max="${(base * 145).toFixed(0)}" value="${(pj.salePrice * 100).toFixed(0)}" style="width:100%;margin-top:8px;accent-color:var(--gold)">
    </div>
    <div id="pInfo" class="hint"></div>
    <div class="hint">価格を下げれば契約は速く進むが、ブランドと利益が犠牲になる。逆に強気の価格は在庫の長期化を招き、評価損の原因になる。</div>
    <div class="btnrow"><button class="btn primary" data-set="1">この価格に設定する</button></div>`;
  }
  function bind() {
    const body = document.getElementById('modalBody');
    const inp = body.querySelector('#inpP'), rg = body.querySelector('#rngP'), info = body.querySelector('#pInfo');
    const sync = v => {
      inp.value = v; rg.value = v;
      const price = v / 100;
      const ratio = price / pj.plan.salePrice;
      const speed = Math.max(0.12, Math.min(1.85, 2.15 - ratio * 1.15));
      info.innerHTML = `市場比 <b>${((ratio - 1) * 100).toFixed(1)}%</b>　販売総額 ${money(Math.round(pj.saleArea * price))}　契約の進み ${speed > 1.2 ? '<b class="up">速い</b>' : speed > 0.85 ? '標準的' : '<b class="down">遅い</b>'}`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-set]').onclick = () => {
      pj.salePrice = (+inp.value) / 100;
      toast(`販売価格を坪${inp.value}万円に設定した`);
      ctx.refresh(); closeModal();
    };
  }
}

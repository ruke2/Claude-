// ============================================================
//  開発パネル — 企画・着工・工事進捗
// ============================================================
import { money, num, pct, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES, CITIES, cityOf } from '../data/city.js';
import { feasibility, feasibilityStack, canStart } from '../sim/project.js';
import { landAppraisal, maxFloorsFor, STACK_RULE } from '../sim/valuation.js';
import { weeksLabel } from '../core/time.js';
import { brandsFor, brandEffect, BRAND_CATEGORIES } from '../sim/brands.js';
import { orgPower, projectCapacity } from '../sim/hr.js';
import { debtCapacity } from '../sim/finance.js';
import { offerFor } from '../sim/jv.js';

export const title = '開発事業';

export function render(g, ctx) {
  const p = orgPower(g);
  const cap = projectCapacity(g);
  const idle = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);

  const running = g.projects.length ? g.projects.map(pj => {
    const c = g.cells.find(x => x.id === pj.cellId);
    const total = Math.max(4, pj.weeks + pj.delay);
    const remain = Math.max(0, total - pj.elapsed);
    const over = pj.overrun;
    return `<div class="card">
      <div class="card-t">
        <span class="card-n">${pj.name}</span>
        ${chip(USES[pj.use].name, 'cyan')}
      </div>
      <div class="card-s">${DISTRICTS[pj.district].name}／地上${pj.floors}階・延床${num(pj.gfa)}坪／${GRADES[pj.grade].name}</div>
      ${bar(pj.progress, 'gold')}
      <div class="kv"><span class="k">進捗</span><span class="v">${(pj.progress * 100).toFixed(0)}%（残り${weeksLabel(remain)}）</span></div>
      <div class="kv"><span class="k">工事予算 / 支出</span><span class="v">${money(pj.budget)} / ${money(pj.spent)}</span></div>
      ${over ? `<div class="kv"><span class="k">増減額</span><span class="v ${over > 0 ? 'down' : 'up'}">${money(over, { sign: true })}</span></div>` : ''}
      ${pj.delay ? `<div class="kv"><span class="k">工期</span><span class="v ${pj.delay > 0 ? 'down' : 'up'}">${pj.delay > 0 ? `${pj.delay}週 遅延` : `${-pj.delay}週 前倒し`}</span></div>` : ''}
      ${pj.stack && pj.nra ? `<div class="kv"><span class="k">賃貸部分</span><span class="v">${num(pj.nra)}坪／月坪${num(pj.rent)}円</span></div>` : ''}
      ${pj.saleArea ? `<div class="kv"><span class="k">事前契約率（青田売り）</span><span class="v">${(pj.preContract * 100).toFixed(0)}%</span></div>${bar(pj.preContract)}` : ''}
      ${pj.events.length ? `<div class="hint">${pj.events.slice(-2).map(e => `${e.icon} ${e.text}`).join('<br>')}</div>` : ''}
      <div class="btnrow">
        <button class="btn sm" data-act="focus" data-id="${pj.cellId}">📍 地図で見る</button>
        ${pj.saleArea ? `<button class="btn sm" data-act="dev.price" data-id="${pj.id}">販売価格を調整（${pj.stack ? '分譲部分 ' : ''}坪${(pj.salePrice * 100).toFixed(0)}万円）</button>` : ''}
      </div>
    </div>`;
  }).join('') : empty('進行中の開発案件はない');

  const idleCards = idle.length ? idle.map(c => {
    const d = DISTRICTS[c.d];
    const best = bestPlan(g, c);
    const off = offerFor(g, c.id);
    const rv = off ? g.rivals.find(r => r.id === off.rivalId) : null;
    const jv = c.jv ? g.rivals.find(r => r.id === c.jv.rivalId) : null;
    return `<div class="card click" data-act="dev.plan" data-id="${c.id}">
      <div class="card-t"><span class="card-n">${d.name}　${num(c.area)}坪</span>
        ${jv ? chip(`共同：${jv.short} ${Math.round((1 - c.jv.share) * 100)}%`, 'good') : chip('企画待ち', 'amber')}</div>
      <div class="card-s">容積率 ${c.far}%／推奨 ${USES[best.use].name}・${GRADES[best.grade].name}<br>
        想定事業利益 <b class="${best.profit >= 0 ? 'up' : 'down'}">${money(best.profit, { sign: true })}</b>（利益率 ${pct(best.margin)}）</div>
      ${off && rv ? `<div class="warnrow">${rv.name}から共同事業の打診（先方 ${Math.round(off.theirShare * 100)}% 希望・あと${Math.max(0, off.deadline - g.week)}週）</div>` : ''}
      <div class="btnrow">
        <button class="btn sm primary" data-act="dev.plan" data-id="${c.id}">事業計画を作る</button>
        ${off ? `<button class="btn sm" data-act="jv.open" data-id="${c.id}">🤝 共同事業を検討する</button>` : ''}
        <button class="btn sm" data-act="focus" data-id="${c.id}">📍 地図で見る</button>
      </div>
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

/** 地区の適性から複合構成を提案する */
export function recommendStack(g, cell) {
  const d = DISTRICTS[cell.d];
  const max = maxFloorsFor(g, cell, [{ use: 'office', floors: 10 }]);
  const order = ['retail', 'office', 'hotel', 'resi', 'rental'];
  const picks = order.filter(u => (d.fit[u] ?? 0) >= 0.55);
  if (!picks.includes('retail')) picks.unshift('retail');
  const st = [];
  let left = Math.max(4, max);
  const podium = Math.max(2, Math.min(4, Math.round(left * 0.12)));
  st.push({ use: 'retail', floors: podium });
  left -= podium;
  const rest = picks.filter(u => u !== 'retail');
  if (!rest.length) { st.push({ use: 'office', floors: left }); return st; }
  const weights = rest.map(u => (d.fit[u] ?? 0.3));
  const sum = weights.reduce((a, b) => a + b, 0);
  rest.forEach((u, i) => {
    const f = i === rest.length - 1 ? left : Math.max(2, Math.round(left * weights[i] / sum));
    st.push({ use: u, floors: Math.max(1, f) });
    left -= f;
  });
  return st.filter(x => x.floors > 0);
}

// ------------------------------------------------------------
//  企画モーダル
// ------------------------------------------------------------
export function openPlan(g, cell, ctx) {
  const d = DISTRICTS[cell.d];
  const rec = bestPlan(g, cell);
  const pg = cell.program;                       // 公共案件の条件（あれば）
  let use = pg ? pg.use : rec.use;
  let grade = rec.grade;
  if (pg && pg.minGrade) {
    const order = ['standard', 'high', 'luxury'];
    if (order.indexOf(grade) < order.indexOf(pg.minGrade)) grade = pg.minGrade;
  }
  let brandId = null;
  let stack = recommendStack(g, cell);

  openModal(`事業計画 — ${cityOf(cell.d) === 'minato' ? '' : CITIES[cityOf(cell.d)].short + '・'}${d.name} ${num(cell.area)}坪`, build(), []);
  bind();

  function build() {
    const avail = brandsFor(g, use);
    if (brandId && !avail.some(b => b.id === brandId)) brandId = null;
    const isMixed = use === 'mixed';
    const plan = isMixed ? feasibilityStack(g, cell, stack, grade, brandId) : feasibility(g, cell, use, grade, brandId);
    const bf = brandEffect(g, brandId);
    if (!plan) return '<div class="empty">構成を1つ以上指定すること</div>';
    const err = canStart(g, cell, use, grade);
    const equity = Math.max(0, plan.buildCost - Math.max(0, g.cash - 500));
    const risks = (cell.risks || []).filter(r => r.bad);
    const goods = (cell.risks || []).filter(r => !r.bad);

    return `
    <div class="grid3" style="margin-bottom:12px">
      ${mini('土地簿価', money(cell.bookValue ?? cell.lastPaid ?? 0, { unit: false }), moneyUnit(cell.bookValue ?? cell.lastPaid ?? 0))}
      ${mini('建設費', money(plan.buildCost, { unit: false }), moneyUnit(plan.buildCost))}
      ${mini('総事業費', money(plan.totalCost, { unit: false }), moneyUnit(plan.totalCost))}
    </div>

    <div class="sec">
      <div class="sec-t"><span>商品の設計</span></div>
      <div class="field"><label>用途${pg ? '（公募条件により変更できない）' : ''}</label>
        <select id="selUse"${pg ? ' disabled' : ''}>${Object.values(USES).map(u => `<option value="${u.id}" ${u.id === use ? 'selected' : ''}>${u.icon} ${u.name}（適合 ${(d.fit[u.id] ?? .3).toFixed(2)}）</option>`).join('')}</select>
      </div>
      <div class="hint">${USES[use].desc}</div>
      <div class="field" style="margin-top:10px"><label>グレード</label>
        <select id="selGrade">${Object.values(GRADES).map(x => `<option value="${x.id}" ${x.id === grade ? 'selected' : ''}>${x.name}（建設費 ×${x.costMul.toFixed(2)} ／ 単価 ×${x.priceMul.toFixed(2)}）</option>`).join('')}</select>
      </div>
      <div class="hint">${GRADES[grade].desc}　ブランド寄与 +${GRADES[grade].brandGain}</div>
      <div class="field" style="margin-top:10px"><label>自社ブランド</label>
        <select id="selBrand">
          <option value="">（ブランドを冠さない）</option>
          ${avail.map(b => `<option value="${b.id}" ${b.id === brandId ? 'selected' : ''}>${b.name}（認知度 ${b.awareness.toFixed(0)}）</option>`).join('')}
        </select>
      </div>
      <div class="hint">${avail.length
        ? (brandId ? `単価 +${pct(bf.price - 1, 1)}／契約速度 +${pct(bf.speed - 1, 1)}／賃料 +${pct(bf.rent - 1, 1)}。供給するとこのブランドの認知度が上がる。`
          : 'ブランドを冠すると単価と契約速度が上がり、供給実績がブランドを育てる。')
        : `この用途（${USES[use].name}）に使えるブランドがない。ブランドタブから立ち上げられる。`}</div>
    </div>

    ${isMixed ? stackEditor(plan) : ''}

    ${pg ? `<div class="sec">
      <div class="sec-t"><span>公募条件</span><span class="note">${pg.name}</span></div>
      <div class="card" style="border-color:rgba(13,126,168,.35)">
        <div class="card-t"><span class="card-n">${pg.icon} ${pg.name}</span></div>
        <div class="card-s">${pg.desc}</div>
        ${kv('指定用途', USES[pg.use].name)}
        ${kv('仕様の下限', GRADES[pg.minGrade] ? GRADES[pg.minGrade].name : '—')}
        ${plan.programCost ? kv('公共貢献施設の負担', `<span class="down">${money(plan.programCost)}</span>`) : ''}
        <div class="hint">この条件を外した計画では着工できない。負担は事業費に織り込み済みである。</div>
      </div>
    </div>` : ''}

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
          ${kv('工期', weeksLabel(plan.weeks) + `（${plan.weeks}週）`)}
        </div>
        <div>
          ${plan.saleArea ? kv('分譲面積', num(plan.saleArea) + '坪') : ''}
          ${plan.units ? kv('計画戸数', num(plan.units) + '戸') : ''}
          ${plan.salePrice ? kv(plan.stack ? '分譲部分の坪単価（加重平均）' : '想定坪単価', (plan.salePrice * 100).toFixed(0) + '万円') : ''}
          ${plan.saleRevenue ? kv('分譲売上', money(plan.saleRevenue)) : ''}
          ${plan.nra ? kv('貸室面積', num(plan.nra) + '坪') : ''}
          ${plan.rent ? kv(plan.stack ? '賃貸部分の賃料（加重平均）' : '想定賃料', num(plan.rent) + '円/坪·月') : ''}
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
        <div class="hint">工事代金は出来高に応じて毎週支払う。1週あたり約${money(Math.round(plan.buildCost / plan.weeks))}、四半期あたり約${money(Math.round(plan.buildCost / plan.weeks * 13))}。</div>
      </div>
    </div>

    ${err ? `<div class="card" style="border-color:rgba(255,107,122,.4)"><div class="card-s" style="color:var(--red)">${err}</div></div>` : ''}
    ${isMixed && plan.over ? `<div class="card" style="border-color:rgba(255,107,122,.5)"><div class="card-s" style="color:var(--red)">容積率を超過している。延床${num(plan.gfa)}坪に対し、この敷地で建てられるのは${num(plan.maxGfa)}坪までである。階数を減らすこと。</div></div>` : ''}
    <div class="btnrow">
      <button class="btn primary wide" data-start="1" ${err || (isMixed && plan.over) ? 'disabled' : ''}>この計画で着工する</button>
    </div>`;
  }

  function stackEditor(plan) {
    const maxF = maxFloorsFor(g, cell, stack);
    const ratio = plan.gfa / Math.max(1, plan.maxGfa);
    const rows = plan.stack.slice().reverse().map((seg) => {
      const idx = stack.findIndex(x => x.use === seg.use && x.floors === seg.floors && x.from === undefined) >= 0 ? -1 : -1;
      const realIdx = plan.stack.indexOf(seg);
      const R = STACK_RULE[seg.use] || {};
      return `<div class="card" style="padding:9px 11px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <select class="segUse selin" data-i="${realIdx}" style="min-width:116px">
            ${['retail', 'office', 'hotel', 'resi', 'rental', 'logi'].map(u => `<option value="${u}" ${u === seg.use ? 'selected' : ''}>${USES[u].icon} ${USES[u].name}</option>`).join('')}
          </select>
          <button class="btn sm" data-seg="minus" data-i="${realIdx}">−</button>
          <span style="min-width:44px;text-align:center;font-family:Oswald,sans-serif;font-size:15px">${seg.floors}F</span>
          <button class="btn sm" data-seg="plus" data-i="${realIdx}">＋</button>
          <button class="btn sm danger" data-seg="del" data-i="${realIdx}">×</button>
        </div>
        <div class="kv" style="margin-top:5px">
          <span class="k">${seg.from}〜${seg.to}階　${R.label || ''}</span>
          <span class="v">${seg.model === 'sale'
        ? `分譲 ${money(seg.revenue)}（坪${(seg.price * 100).toFixed(0)}万円）`
        : `NOI ${money(seg.noi)}／年`}　<span style="color:${seg.floorMul >= 1 ? 'var(--green)' : seg.floorMul >= 0.85 ? 'var(--ink-dim)' : 'var(--red)'}">×${seg.floorMul.toFixed(2)}</span></span>
        </div>
      </div>`;
    }).join('');

    return `<div class="sec">
      <div class="sec-t"><span>フロア構成</span><span class="note">下から積み上げる</span></div>
      <div class="kv"><span class="k">容積消化</span><span class="v ${plan.over ? 'down' : ''}">${num(plan.gfa)}坪 / ${num(plan.maxGfa)}坪（${pct(ratio, 0)}）</span></div>
      ${bar(Math.min(1, ratio), plan.over ? 'red' : 'gold')}
      <div class="kv"><span class="k">総階数</span><span class="v">${plan.floors}階（この敷地の上限 約${maxF}階）</span></div>
      <div class="kv"><span class="k">基準階の床面積</span><span class="v">${num(plan.plate)}坪</span></div>
      <div style="margin-top:10px">${rows}</div>
      <div class="btnrow"><button class="btn sm" data-seg="add">＋ 構成を追加する</button>
        <button class="btn sm ghost" data-seg="auto">推奨構成に戻す</button></div>
      <div class="hint">商業は低層、住宅は上層に置くと収益が伸びる。配置が悪いと補正が1.00を下回り、同じ床でも稼げなくなる。</div>
    </div>`;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }

  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('.segUse').forEach(el => el.onchange = e => {
      const i = +e.target.dataset.i;
      if (stack[i]) { stack[i].use = e.target.value; refresh(); }
    });
    body.querySelectorAll('[data-seg]').forEach(el => el.onclick = () => {
      const act = el.dataset.seg, i = +el.dataset.i;
      if (act === 'add') stack.push({ use: 'office', floors: 3 });
      else if (act === 'auto') stack = recommendStack(g, cell);
      else if (stack[i]) {
        if (act === 'plus') stack[i].floors++;
        else if (act === 'minus') stack[i].floors = Math.max(1, stack[i].floors - 1);
        else if (act === 'del' && stack.length > 1) stack.splice(i, 1);
      }
      refresh();
    });
    const su = body.querySelector('#selUse'), sg = body.querySelector('#selGrade');
    if (su) su.onchange = e => { use = e.target.value; refresh(); };
    if (sg) sg.onchange = e => { grade = e.target.value; refresh(); };
    const sb = body.querySelector('#selBrand');
    if (sb) sb.onchange = e => { brandId = e.target.value || null; refresh(); };
    const st = body.querySelector('[data-start]');
    if (st) st.onclick = () => { ctx.startProject(cell, use, grade, brandId, use === 'mixed' ? stack : null); closeModal(); };
  }
}

/** 分譲価格の調整（建設中の青田売り） */
export function openPricing(g, pj, ctx) {
  // 基準単価。計画に入っていない案件（旧版の複合開発）は現在値から拾う
  const base = (pj.plan && pj.plan.salePrice > 0) ? pj.plan.salePrice
    : (pj.plan && pj.plan.saleRevenue > 0 && pj.plan.saleArea > 0) ? pj.plan.saleRevenue / pj.plan.saleArea
      : (pj.salePrice > 0 ? pj.salePrice : 0);
  if (!(base > 0)) {
    openModal(`販売価格の設定 — ${pj.name}`,
      '<div class="empty">この案件には分譲部分の想定単価が設定されていない。<br>週を進めると自動的に引き直される。</div>',
      [{ label: '閉じる', cls: 'ghost' }]);
    return;
  }
  openModal(`販売価格の設定 — ${pj.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();
  function build() {
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
      <input type="range" id="rngP" min="${Math.min(base * 60, pj.salePrice * 100).toFixed(0)}" max="${Math.max(base * 145, pj.salePrice * 100).toFixed(0)}" value="${(pj.salePrice * 100).toFixed(0)}" style="width:100%;margin-top:8px;accent-color:var(--gold)">
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
      const ratio = price / base;
      const speed = Math.max(0.12, Math.min(1.85, 2.15 - ratio * 1.15));
      info.innerHTML = `市場比 <b>${((ratio - 1) * 100).toFixed(1)}%</b>　販売総額 ${money(Math.round(pj.saleArea * price))}　契約の進み ${speed > 1.2 ? '<b class="up">速い</b>' : speed > 0.85 ? '標準的' : '<b class="down">遅い</b>'}`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-set]').onclick = () => {
      // 基準単価の50%〜160%に収める（0にすると売上が立たないまま原価だけが出る）
      pj.salePrice = Math.min(base * 1.6, Math.max(base * 0.5, (+inp.value) / 100));
      toast(`販売価格を坪${(pj.salePrice * 100).toFixed(0)}万円に設定した`);
      ctx.refresh(); closeModal();
    };
  }
}

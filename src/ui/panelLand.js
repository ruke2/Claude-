// ============================================================
//  用地パネル — 売却情報・デューデリジェンス・入札
// ============================================================
import { money, num, pct, clamp } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES, TERRAIN } from '../data/city.js';
import { LISTING_KINDS, ddCost, runDueDiligence, ACQ_FEE, holdingCost } from '../sim/land.js';
import { devPlan, landAppraisal, bestUseFit } from '../sim/valuation.js';
import { orgPower } from '../sim/hr.js';
import { debtCapacity } from '../sim/finance.js';
import { RNG } from '../core/rng.js';

export const title = '用地取得';

export function render(g, ctx) {
  const p = orgPower(g);
  const owned = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);
  const bidding = g.listings.filter(l => l.bid);

  const cards = g.listings.length ? g.listings.map(l => {
    const c = g.cells.find(x => x.id === l.cellId);
    const d = DISTRICTS[c.d];
    const K = LISTING_KINDS[l.kind];
    const known = l.risks.filter(r => r.found);
    return `<div class="card click" data-act="land.detail" data-id="${l.id}">
      <div class="card-t">
        <span class="card-n">${d.name}　${num(c.area)}坪</span>
        ${chip(K.name, l.kind === 'nego' ? 'green' : l.kind === 'proposal' ? 'violet' : 'cyan')}
      </div>
      <div class="card-s">
        容積率 ${c.far}% ／ 最有効利用 ${USES[l.bestUse].name} ／ 駅力 ${(c.station * 100).toFixed(0)}
        <br>売主：${l.seller}
      </div>
      <div class="kv"><span class="k">売出価格</span><span class="v">${money(l.askPrice)}</span></div>
      <div class="kv"><span class="k">当社査定</span><span class="v">${money(l.appraisal)}</span></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
        ${chip(`締切まで ${l.deadline}期`, l.deadline <= 1 ? 'red' : 'grey')}
        ${l.ddLevel ? chip(`調査済 Lv${l.ddLevel}`, 'cyan') : chip('未調査', 'amber')}
        ${known.length ? chip(`判明した事項 ${known.length}件`, known.some(r => r.bad) ? 'red' : 'green') : ''}
        ${l.bid ? chip(`入札済 ${money(l.bid.amount)}`, 'gold') : ''}
      </div>
    </div>`;
  }).join('') : empty('現在、売りに出ている用地はない。<br>用地開発部の陣容を厚くすると情報が集まりやすくなる。');

  const ownedCards = owned.length ? owned.map(c => {
    const d = DISTRICTS[c.d];
    const app = landAppraisal(g, c);
    const book = c.bookValue ?? c.lastPaid ?? 0;
    const gain = app - book;
    return `<div class="card click" data-act="dev.plan" data-id="${c.id}">
      <div class="card-t"><span class="card-n">${d.name}　${num(c.area)}坪</span>${chip('未着工', 'amber')}</div>
      <div class="card-s">容積率 ${c.far}%／取得 ${money(book)}／時価 ${money(app)}
        <span class="${gain >= 0 ? 'up' : 'down'}">（${money(gain, { sign: true })}）</span><br>
        保有コスト ${money(holdingCost(g, c))}／四半期
        ${(c.risks || []).filter(r => r.bad).length ? `<br><span style="color:var(--red)">未解消の課題：${(c.risks || []).filter(r => r.bad).map(r => r.name).join('・')}</span>` : ''}
      </div>
      <div class="btnrow"><button class="btn sm primary" data-act="dev.plan" data-id="${c.id}">事業化を検討する</button></div>
    </div>`;
  }).join('') : empty('未着工の保有地はない');

  return `
  ${section('用地情報の入手力', '', `
    <div class="grid3">
      ${mini('用地開発部', p.land.quality.toFixed(0), `${p.land.count}名`)}
      ${mini('今期の案件数', g.listings.length + '件', '市況とチーム力で変動')}
      ${mini('入札中', bidding.length + '件', '締切で自動的に開札')}
    </div>
    <div class="hint">用地開発部の人員と能力が高いほど、多くの売却情報が持ち込まれる。仲介子会社の買収も情報量を押し上げる。</div>
  `)}
  ${section('売却情報', `${g.listings.length}件`, cards)}
  ${section('保有中の未着工用地', `${owned.length}件`, ownedCards)}
  `;
}

// ------------------------------------------------------------
//  案件詳細
// ------------------------------------------------------------
export function openDetail(g, listing, ctx) {
  const c = g.cells.find(x => x.id === listing.cellId);
  if (!c) return;
  const d = DISTRICTS[c.d];
  const K = LISTING_KINDS[listing.kind];
  let use = listing.bestUse, grade = 'standard', planLevel = 1;

  const body = openModal(`${d.name}　${num(c.area)}坪`, buildHTML(), [
    { label: '閉じる', cls: 'ghost' },
  ]);
  bind();

  function buildHTML() {
    const plan = devPlan(g, c, use, grade, { landCost: listing.appraisal });
    const known = listing.risks.filter(r => r.found);
    const room = Math.max(0, debtCapacity(g) - g.debt);
    const power = g.cash + room;
    const p = orgPower(g);
    // 他社の入札レンジ予測（用地部の情報力で精度が上がる）
    const acc = Math.min(0.92, 0.35 + p.land.quality / 220);
    const est = Math.round(plan.residualLand * 0.86);
    const spread = Math.round(est * (0.42 - acc * 0.30));

    return `
    <div class="grid3" style="margin-bottom:14px">
      ${mini('売出価格', money(listing.askPrice, { unit: false }), '億円')}
      ${mini('当社査定', money(listing.appraisal, { unit: false }), '億円')}
      ${mini('取得諸費用', money(Math.round(listing.askPrice * ACQ_FEE), { unit: false }), `売買価格の${(ACQ_FEE * 100).toFixed(1)}%`)}
    </div>

    <div class="card">
      <div class="card-t"><span class="card-n">${K.icon} ${K.name}</span>${chip(`締切まで ${listing.deadline}期`, listing.deadline <= 1 ? 'red' : 'grey')}</div>
      <div class="card-s">${K.desc}<br>売主：${listing.seller}<br>${listing.note}</div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>区画の概要</span></div>
      <div class="grid2">
        <div>
          ${kv('所在', d.name)}
          ${kv('敷地面積', num(c.area) + '坪')}
          ${kv('容積率', c.far + '%')}
        </div>
        <div>
          ${kv('駅力', (c.station * 100).toFixed(0) + ' / 100')}
          ${kv('最有効利用', USES[listing.bestUse].name)}
          ${kv('用途適合', (d.fit[use] ?? 0.3).toFixed(2))}
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>デューデリジェンス</span><span class="note">${listing.ddLevel ? `実施済み（Lv${listing.ddLevel}）` : '未実施'}</span></div>
      ${known.length ? known.map(r => `
        <div class="card" style="border-color:${r.bad ? 'rgba(255,107,122,.3)' : 'rgba(74,222,155,.3)'}">
          <div class="card-t"><span class="card-n">${r.bad ? '⚠' : '✨'} ${r.name}</span>${chip(r.bad ? 'リスク' : '好材料', r.bad ? 'red' : 'green')}</div>
          <div class="card-s">${r.desc}</div>
        </div>`).join('')
        : `<div class="hint">${listing.ddLevel ? '調査の範囲では特段の問題は見つからなかった。ただし見落としの可能性は残る。' : '調査を行わないまま取得すると、土壌汚染や地中障害物といった瑕疵を引き受けることになる。'}</div>`}
      <div class="btnrow">
        <button class="btn sm" data-dd="1" ${listing.ddLevel >= 1 ? 'disabled' : ''}>簡易調査 ${money(ddCost(listing, 1))}</button>
        <button class="btn sm" data-dd="2" ${listing.ddLevel >= 2 ? 'disabled' : ''}>詳細調査 ${money(ddCost(listing, 2))}</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>事業収支シミュレーション</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <select id="selUse" style="flex:1;min-width:140px;padding:7px;border-radius:7px;background:rgba(0,0,0,.35);border:1px solid var(--line);color:var(--ink)">
          ${Object.values(USES).map(u => `<option value="${u.id}" ${u.id === use ? 'selected' : ''}>${u.name}（適合 ${(d.fit[u.id] ?? 0.3).toFixed(2)}）</option>`).join('')}
        </select>
        <select id="selGrade" style="flex:1;min-width:120px;padding:7px;border-radius:7px;background:rgba(0,0,0,.35);border:1px solid var(--line);color:var(--ink)">
          ${Object.values(GRADES).map(x => `<option value="${x.id}" ${x.id === grade ? 'selected' : ''}>${x.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid2">
        <div>
          ${kv('延床面積', num(plan.gfa) + '坪')}
          ${kv('想定階数', '地上' + plan.floors + '階')}
          ${kv('建設費', money(plan.buildCost))}
          ${kv('工期', plan.quarters + '四半期')}
        </div>
        <div>
          ${plan.saleRevenue ? kv('分譲売上', money(plan.saleRevenue)) : ''}
          ${plan.units ? kv('計画戸数', num(plan.units) + '戸') : ''}
          ${plan.assetValue ? kv('完成時資産価値', money(plan.assetValue)) : ''}
          ${plan.noi ? kv('年間NOI', money(plan.noi)) : ''}
          ${plan.yieldOnCost ? kv('開発利回り', pct(plan.yieldOnCost)) : ''}
        </div>
      </div>
      <div class="card" style="margin-top:10px;border-color:rgba(227,181,88,.3)">
        ${kv('土地に払える上限（残余法）', `<b style="color:var(--gold)">${money(plan.residualLand)}</b>`, 'big')}
        ${kv('想定事業利益', `<span class="${plan.profit >= 0 ? 'up' : 'down'}">${money(plan.profit, { sign: true })}（${pct(plan.margin)}）</span>`)}
        <div class="hint">目標利益率15%を確保した場合に土地へ支払える金額。これを超えて入札すると高値掴みになる。</div>
      </div>
      <div class="card" style="margin-top:8px">
        ${kv('他社の想定入札レンジ', `${money(Math.max(0, est - spread))} 〜 ${money(est + spread)}`)}
        <div class="hint">用地開発部の情報力：${(acc * 100).toFixed(0)}%（高いほど予測が絞り込まれる）</div>
      </div>
    </div>

    ${listing.kind === 'proposal' ? `
    <div class="sec">
      <div class="sec-t"><span>提案の作り込み</span></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${[[1, '標準提案', 0], [2, '重点提案', Math.round(listing.askPrice * 0.004)], [3, '全社総力', Math.round(listing.askPrice * 0.012)]].map(([lv, nm, cost]) => `
          <button class="btn sm ${planLevel === lv ? 'primary' : ''}" data-plan="${lv}">${nm}${cost ? `（${money(cost)}）` : ''}</button>`).join('')}
      </div>
      <div class="hint">提案コンペでは価格だけでなく企画内容が評価される。商品企画部の能力と提案への投資が勝敗を分ける。</div>
    </div>` : ''}

    <div class="sec">
      <div class="sec-t"><span>入札</span><span class="note">投資余力 ${money(power)}</span></div>
      <div class="field">
        <label>入札金額（億円）</label>
        <input type="number" id="inpBid" value="${Math.round((listing.bid ? listing.bid.amount : Math.min(plan.residualLand * 0.82, listing.askPrice)) / 100)}" step="1" min="0">
      </div>
      <input type="range" id="rngBid" min="${Math.round(listing.appraisal * 0.4 / 100)}" max="${Math.round(Math.max(listing.askPrice, plan.residualLand) * 1.35 / 100)}" value="${Math.round((listing.bid ? listing.bid.amount : Math.min(plan.residualLand * 0.82, listing.askPrice)) / 100)}" style="width:100%;accent-color:var(--gold)">
      <div id="bidInfo" class="hint"></div>
      <div class="btnrow">
        ${listing.kind === 'nego'
        ? `<button class="btn primary" data-buy="1">${money(listing.askPrice)}で即時取得する</button>`
        : `<button class="btn primary" data-bid="1">この金額で入札する</button>`}
        ${listing.bid ? `<button class="btn danger" data-cancel="1">入札を取り下げる</button>` : ''}
      </div>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    const body = document.getElementById('modalBody');
    const su = body.querySelector('#selUse'), sg = body.querySelector('#selGrade');
    if (su) su.onchange = e => { use = e.target.value; refresh(); };
    if (sg) sg.onchange = e => { grade = e.target.value; refresh(); };
    body.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => {
      const lv = +b.dataset.dd;
      const cost = ddCost(listing, lv);
      if (g.cash < cost) return toast('資金が不足している', 'bad');
      g.cash -= cost;
      g.finance.quarterAcc.cogsOther += cost;
      const rng = new RNG(g.rngState ^ (listing.id.length * 7919) ^ g.turn);
      const found = runDueDiligence(g, listing, lv, rng);
      g.rngState = rng.s;
      toast(found ? `調査により${found}件の事実が判明した` : '特段の問題は発見されなかった', found ? 'bad' : 'good');
      ctx.refresh(); refresh();
    });
    body.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
      const lv = +b.dataset.plan;
      const cost = [0, 0, Math.round(listing.askPrice * 0.004), Math.round(listing.askPrice * 0.012)][lv];
      if (cost && g.cash < cost) return toast('資金が不足している', 'bad');
      if (cost) { g.cash -= cost; g.finance.quarterAcc.sga += cost; }
      planLevel = lv; refresh(); ctx.refresh();
    });
    const inp = body.querySelector('#inpBid'), rng2 = body.querySelector('#rngBid'), info = body.querySelector('#bidInfo');
    const sync = (v) => {
      if (inp) inp.value = v; if (rng2) rng2.value = v;
      const amt = v * 100;
      const plan = devPlan(g, c, use, grade, { landCost: amt });
      const fee = Math.round(amt * ACQ_FEE);
      if (info) info.innerHTML = `取得総額 ${money(amt + fee)}（諸費用込み）／この価格での想定利益率 <b class="${plan.margin >= 0.12 ? 'up' : plan.margin >= 0 ? '' : 'down'}">${pct(plan.margin)}</b>`;
    };
    if (inp) inp.oninput = e => sync(+e.target.value);
    if (rng2) rng2.oninput = e => sync(+e.target.value);
    sync(+(inp ? inp.value : 0));
    const bid = body.querySelector('[data-bid]');
    if (bid) bid.onclick = () => {
      const amt = Math.round((+inp.value) * 100);
      const fee = Math.round(amt * ACQ_FEE);
      if (amt <= 0) return toast('金額を入力すること', 'bad');
      if (amt + fee > g.cash + Math.max(0, debtCapacity(g) - g.debt)) return toast('投資余力を超えている', 'bad');
      listing.bid = { amount: amt, planQuality: [0, 40, 62, 84][planLevel], use, grade };
      toast(`${money(amt)}で入札した。開札は${listing.deadline}期後である`, 'good');
      ctx.refresh(); closeModal();
    };
    const buy = body.querySelector('[data-buy]');
    if (buy) buy.onclick = () => {
      const amt = listing.askPrice, fee = Math.round(amt * ACQ_FEE);
      if (g.cash < amt + fee) {
        const room = Math.max(0, debtCapacity(g) - g.debt);
        if (g.cash + room < amt + fee) return toast('資金と借入枠が不足している', 'bad');
        const need = Math.ceil((amt + fee - g.cash) / 100) * 100;
        g.debt += need; g.cash += need;
        toast(`不足分 ${money(need)} を借り入れた`);
      }
      ctx.acquireNow(listing, c, amt);
      closeModal();
    };
    const cancel = body.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = () => { listing.bid = null; toast('入札を取り下げた'); ctx.refresh(); closeModal(); };
  }
}
